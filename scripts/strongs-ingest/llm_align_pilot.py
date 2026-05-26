#!/usr/bin/env python3
"""
End-to-end pilot of the LLM-alignment approach from
llm-strongs-alignment-spec.md, scoped to Italian (RIV) James chapter 1.

Pipeline:
  1. EXTRACT  — for each verse in James 1, union the Strong's numbers that
                appear across our 4 already-tagged languages
                (RVR09/SCH51/LSG/SYN). That's the candidate inventory.
                Look up each Strong's in the OpenScriptures Greek dictionary
                for lemma + transliteration + gloss.
  2. DUMP     — fetch Italian RIV James 1 plain text from the live API
                (one chapter, one HTTP call).
  3. BUILD    — emit batches/riv_james1.jsonl in Anthropic Message Batches
                API shape (one record per verse).
  4. RUN      — call the API (real-time, since 27 verses is trivial; switch
                to batch for the full multi-language run later). Each call
                returns {tokens: [{text, strongs, confidence}, ...]} —
                surface-word picks only, no passthrough.
  5. POST     — for each verse, merge the model's surface picks back into
                the target text using a position-ordered greedy matcher.
                The matcher advances a cursor through the target text;
                anything not picked stays as passthrough. This step is
                what STRUCTURALLY guarantees lossless join — the model
                never produces the final verse, the matcher does.
  6. VALIDATE — roundtrip check + Strong's-in-inventory check + confidence
                stats. Same gate as the CrossWire languages use.

Usage:
  # Build everything offline (no API key needed):
  python3 pilot_align.py --no-api
    → produces samples/riv_james1_prompts.jsonl    (what we'd send)
                samples/riv_james1_target.json     (target text)
                samples/riv_james1_inventory.json  (per-verse Strong's inventory)

  # Full pipeline (needs ANTHROPIC_API_KEY in env):
  python3 pilot_align.py
    → also produces results/riv_james1_raw.jsonl   (raw model output)
                    samples/riv_james1_tokens.jsonl (final post-processed)
                    samples/riv_james1_report.txt   (validation summary)

Dependencies: stdlib only (urllib for the API call).
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parent
PILOT_ROOT = ROOT.parent  # verse-mate-backend-pilot
SAMPLES_DIR = ROOT / "samples"
BATCHES_DIR = ROOT / "batches"
RESULTS_DIR = ROOT / "results"
DATA_DIR = ROOT / "data"
for d in [SAMPLES_DIR, BATCHES_DIR, RESULTS_DIR, DATA_DIR]:
    d.mkdir(exist_ok=True)

# PRODUCTION lexicon — the same _lemmas.json the frontend loads at runtime.
# Keyed by lemma slug (e.g. "iakobos"); we build a Strong's-keyed reverse
# index from it on load. This guarantees the LLM sees the same lemma data
# the frontend will render when a user taps a tagged token — no parallel
# definition pipelines that could drift.
PROD_LEMMAS_PATH = Path(
    "/Users/andytryba/Documents/Claude/Versemate/verse-mate-web/"
    "src/data/lexicon/generated/_lemmas.json"
)

# Languages we already have tagged — these contribute to the candidate inventory.
ANCHOR_LANGS = ["rvr09", "sch51", "lsg", "syn"]

# Target language for this pilot.
TARGET_VERSION_KEY = "RIV"
TARGET_LANG_LABEL = "Italian (Riveduta 1927)"

# Scope.
BOOK_ID = 59       # James
CHAPTER = 1
BOOK_NAME = "James"

# Live API.
API_BASE = "https://api.versemate.org"

# Model. Haiku 4.5 per the spec's recommendation.
MODEL_ID = "claude-haiku-4-5"
MAX_TOKENS = 1024

SYSTEM_PROMPT = """You are a biblical-language scholar aligning a target-language Bible \
translation to its underlying Greek or Hebrew Strong's numbers.

For each content word in the target verse, output the Strong's number from the provided \
source-language inventory that the translator most likely chose to render. Skip articles, \
particles, conjunctions, and prepositions in the target language (those map to grammar, \
not to specific Strong's lemmas).

Constraints:
1. Every Strong's you output MUST appear in the source inventory.
2. Use the EXACT surface form as it appears in the target text (case-preserved, \
accent-preserved). Do not lemmatize or translate.
3. Many-to-one is allowed: multiple target words can share one Strong's.
4. One-to-many is allowed: skip the secondary target words rather than inventing tags.
5. Return null Strong's for content words you cannot confidently align — never guess.
6. Include a confidence score (0.0-1.0) per non-null alignment.
7. Return picks in the order they appear in the target verse, left-to-right.

Return ONLY JSON with this schema, no surrounding prose:
{
  "tokens": [
    {"text": "...", "strongs": "G0000", "confidence": 0.95},
    {"text": "...", "strongs": "H0000", "confidence": 0.88},
    {"text": "...", "strongs": null}
  ]
}"""


# ─── Stage 1: EXTRACT inventory ───────────────────────────────────────────────

def load_tokens_jsonl(path: Path) -> dict[tuple[int, int, int], list[dict]]:
    """Read a samples/<key>_tokens.jsonl into {(book, chap, verse): tokens}."""
    idx: dict[tuple[int, int, int], list[dict]] = {}
    if not path.exists():
        return idx
    for line in path.open():
        row = json.loads(line)
        key = (row["book_id"], row["chapter"], row["verse_number"])
        idx[key] = row["tokens"]
    return idx


def union_strongs_for_verses(book: int, chapter: int) -> dict[int, list[str]]:
    """For each verse in book/chapter, return the union of Strong's that appear
    across all 4 anchor-language token files. Strong's IDs are kept in their
    canonical G####/H#### form (4-digit padded)."""
    anchors = {
        key: load_tokens_jsonl(PILOT_ROOT / "samples" / f"{key}_tokens.jsonl")
        for key in ANCHOR_LANGS
    }
    # Collect all verses in this chapter that any anchor has
    verses = set()
    for idx in anchors.values():
        for (b, c, v) in idx:
            if b == book and c == chapter:
                verses.add(v)
    inventory: dict[int, list[str]] = {}
    for v in sorted(verses):
        seen: list[str] = []
        for idx in anchors.values():
            tokens = idx.get((book, chapter, v))
            if not tokens:
                continue
            for tok in tokens:
                if "strongs" in tok and tok["strongs"] not in seen:
                    seen.append(tok["strongs"])
                # also catch strongs_alt
                for alt in tok.get("strongs_alt", []) or []:
                    if alt not in seen:
                        seen.append(alt)
        inventory[v] = seen
    return inventory


def load_production_lexicon_by_strongs() -> dict[str, dict]:
    """Load production _lemmas.json (keyed by lemma slug) and reindex by
    Strong's number. Returns {G####: {lemma, translit, gloss, pos, ntFrequency}}.

    Strong's IDs in the lexicon are zero-padded G####/H#### form already, so
    no further normalization is needed. The reverse map preserves all the
    fields the LLM might use (basicGloss + pos for disambiguation).

    When two slugs share a Strong's (collision case the lexicon's
    fix_slug_collisions.py addresses), the FIRST entry seen wins — but in
    practice the production data is post-collision-fixed so each Strong's
    has exactly one canonical entry.
    """
    raw = json.loads(PROD_LEMMAS_PATH.read_text())
    by_strongs: dict[str, dict] = {}
    for slug, entry in raw.items():
        if slug == "_meta":
            continue
        strongs = entry.get("strongs")
        if not strongs:
            continue
        if strongs in by_strongs:
            # Keep the higher-frequency (more canonical) entry on collision.
            existing = by_strongs[strongs]
            if (entry.get("ntFrequency", 0) + entry.get("otFrequency", 0)) <= \
               (existing.get("ntFrequency", 0) + existing.get("otFrequency", 0)):
                continue
        by_strongs[strongs] = {
            "lemma": entry.get("lemma", ""),
            "translit": entry.get("translit", ""),
            "gloss": entry.get("basicGloss", ""),
            "pos": entry.get("pos", ""),
            "ntFrequency": entry.get("ntFrequency", 0),
            "_slug": slug,
        }
    return by_strongs


# ─── Stage 2: DUMP target text ────────────────────────────────────────────────

def fetch_target_chapter(book: int, chapter: int, version_key: str) -> dict[int, str]:
    """One HTTP call to the live API. Returns {verse_number: text}."""
    url = f"{API_BASE}/bible/book/{book}/{chapter}?bible_version={version_key}"
    with urllib.request.urlopen(url, timeout=20) as resp:
        data = json.load(resp)
    return {
        v["verseNumber"]: v["text"]
        for v in data["book"]["chapters"][0]["verses"]
    }


# ─── Stage 3: BUILD batch records ─────────────────────────────────────────────

def _trim_gloss(gloss: str, max_chars: int = 60) -> str:
    """OpenScriptures' kjv_def for high-frequency words can list 30+ translations
    in one comma-separated dump. Keep the prompt focused by taking the first 2-3
    senses and truncating the rest. Doesn't affect alignment quality — the model
    still gets the headline meaning."""
    g = (gloss or "").strip()
    if len(g) <= max_chars:
        return g
    # Take up to two comma-separated senses, then ellipsize
    parts = g.split(",")
    out = parts[0].strip()
    for p in parts[1:]:
        candidate = out + ", " + p.strip()
        if len(candidate) > max_chars:
            break
        out = candidate
    return out + ", …"


def build_user_prompt(verse_ref: str, inventory: list[dict], target_text: str) -> str:
    """Match the spec's user-prompt shape exactly."""
    if not inventory:
        inventory_lines = "(no Strong's available — return tokens with strongs=null)"
    else:
        # Format: "- G0025  ἀγαπάω    agapaō   "to love""
        lines = []
        for s in inventory:
            sid = s["strongs"]
            lemma = s.get("lemma", "?")
            translit = s.get("translit", "?")
            gloss = _trim_gloss(s.get("gloss", "?"))
            lines.append(f"- {sid}  {lemma:14s}  {translit:14s}  \"{gloss}\"")
        inventory_lines = "\n".join(lines)
    return (
        f"Verse: {verse_ref}\n"
        f"Source language: Greek\n\n"
        f"Source Strong's inventory (these are the ONLY valid choices):\n"
        f"{inventory_lines}\n\n"
        f"Target language: {TARGET_LANG_LABEL}\n"
        f"Target text: {target_text!r}\n\n"
        f"Return the JSON alignment now."
    )


def build_batch_record(custom_id: str, system: str, user: str) -> dict:
    """Anthropic Message Batches API record shape."""
    return {
        "custom_id": custom_id,
        "params": {
            "model": MODEL_ID,
            "max_tokens": MAX_TOKENS,
            "system": [
                # cache_control gives 90% off after the first request — irrelevant for
                # this 27-verse pilot, but standard hygiene for the full multi-language run.
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}},
            ],
            "messages": [{"role": "user", "content": user}],
        },
    }


# ─── Stage 4: RUN (real-time, one call per verse) ─────────────────────────────
#
# For the full multi-language project this should use POST /v1/messages/batches
# (50% cheaper, async). For a 27-verse pilot, sequential real-time calls are
# simpler and the cost is ~$0.05 total.

def call_anthropic(system: str, user: str, api_key: str) -> dict:
    body = {
        "model": MODEL_ID,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def extract_assistant_text(api_response: dict) -> str:
    blocks = api_response.get("content", [])
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")


def parse_json_block(text: str) -> dict:
    """Models sometimes wrap JSON in ```json fences. Strip if present."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


# ─── Stage 5: POST-PROCESS — merge picks into target text ─────────────────────
#
# The model returns a list of {text, strongs, confidence} picks in left-to-right
# order. We turn that into the canonical VerseMate tokens shape by scanning the
# original target text with a cursor: each pick is found via case-sensitive
# substring search starting at the cursor; the prefix before the match becomes
# a passthrough token; the match itself becomes a tagged token; the cursor
# advances past the match. Picks the matcher can't find advance no cursor and
# are dropped (logged as a warning).
#
# This is what STRUCTURALLY guarantees lossless join — the model can't break
# the invariant because it never produces the final text. The matcher does, by
# reconstructing from the authoritative target string.

def post_process_picks(target_text: str, picks: list[dict],
                       confidence_floor: float = 0.7) -> tuple[list[dict], list[str]]:
    """Returns (tokens, warnings)."""
    tokens: list[dict] = []
    warnings: list[str] = []
    cursor = 0
    for pick in picks:
        surface = (pick.get("text") or "").strip()
        if not surface:
            continue
        strongs = pick.get("strongs")
        conf = pick.get("confidence")
        # Find surface starting at or after cursor.
        idx = target_text.find(surface, cursor)
        if idx < 0:
            # Try case-insensitive as a fallback before giving up
            lower = target_text.lower().find(surface.lower(), cursor)
            if lower < 0:
                warnings.append(f"no_match: {surface!r} after cursor {cursor}")
                continue
            idx = lower
        # Flush passthrough for any gap from cursor to idx.
        if idx > cursor:
            gap = target_text[cursor:idx]
            if tokens and "strongs" not in tokens[-1]:
                tokens[-1]["text"] += gap
            else:
                tokens.append({"text": gap})
        # Emit the tagged token (or demote to passthrough below floor).
        match_text = target_text[idx:idx + len(surface)]
        tok: dict = {"text": match_text}
        if strongs and conf is not None and conf >= confidence_floor:
            tok["strongs"] = strongs
            tok["confidence"] = round(float(conf), 3)
        elif strongs and conf is not None:
            # Below floor — demote to passthrough but keep the strongs as advisory.
            tok["strongs_low_conf"] = strongs
            tok["confidence"] = round(float(conf), 3)
        # else: model returned strongs=null; emit as passthrough.
        tokens.append(tok)
        cursor = idx + len(surface)
    # Tail passthrough.
    if cursor < len(target_text):
        tail = target_text[cursor:]
        if tokens and "strongs" not in tokens[-1]:
            tokens[-1]["text"] += tail
        else:
            tokens.append({"text": tail})
    return tokens, warnings


# ─── Stage 6: VALIDATE ────────────────────────────────────────────────────────

def validate_verse(target_text: str, tokens: list[dict],
                   inventory_strongs: set[str]) -> tuple[bool, list[str], dict]:
    issues: list[str] = []
    joined = "".join(t["text"] for t in tokens)
    if joined != target_text:
        issues.append(f"ROUNDTRIP_BROKEN: joined={joined!r}  expected={target_text!r}")
    # Strong's-in-inventory: every emitted strongs must be in the candidate set
    for t in tokens:
        if "strongs" in t and t["strongs"] not in inventory_strongs:
            issues.append(f"HALLUCINATED: {t['strongs']!r} not in inventory")
    n_tagged = sum(1 for t in tokens if "strongs" in t)
    n_low = sum(1 for t in tokens if "strongs_low_conf" in t)
    confs = [t["confidence"] for t in tokens if "confidence" in t]
    stats = {
        "n_tokens": len(tokens),
        "n_tagged": n_tagged,
        "n_low_conf": n_low,
        "avg_confidence": round(sum(confs) / len(confs), 3) if confs else None,
    }
    return (not issues), issues, stats


# ─── Orchestration ────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-api", action="store_true",
                    help="Build prompts + dump target text only; skip the API call. "
                         "Output: samples/riv_james1_prompts.jsonl + target + inventory.")
    ap.add_argument("--confidence-floor", type=float, default=0.7,
                    help="Below this, demote tagged tokens to passthrough. Default %(default)s")
    ap.add_argument("--rate-limit-sleep", type=float, default=0.5,
                    help="Seconds between API calls. Default %(default)s")
    args = ap.parse_args()

    # 1. EXTRACT
    print("Stage 1: extracting Strong's inventory from anchor languages...",
          file=sys.stderr, flush=True)
    inventory_by_verse = union_strongs_for_verses(BOOK_ID, CHAPTER)
    print(f"  loading production lexicon from {PROD_LEMMAS_PATH.name}...",
          file=sys.stderr, flush=True)
    lex_by_strongs = load_production_lexicon_by_strongs()
    print(f"  {len(lex_by_strongs)} Strong's-keyed lexicon entries available",
          file=sys.stderr, flush=True)
    enriched: dict[int, list[dict]] = {}
    missing_strongs: set[str] = set()
    for v, strongs_list in inventory_by_verse.items():
        rows = []
        for s in strongs_list:
            entry = lex_by_strongs.get(s)
            if entry:
                rows.append({"strongs": s, **entry})
            else:
                # Production lexicon doesn't have this Strong's. Don't pass it
                # to the LLM — if it's not in production, the frontend can't
                # render it anyway. Log and skip.
                missing_strongs.add(s)
        enriched[v] = rows
    if missing_strongs:
        print(f"  WARN {len(missing_strongs)} Strong's missing from production "
              f"lexicon (dropped from inventory): {sorted(missing_strongs)[:10]}...",
              file=sys.stderr, flush=True)
    inventory_path = SAMPLES_DIR / "riv_james1_inventory.json"
    inventory_path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))
    n_strongs_total = sum(len(v) for v in enriched.values())
    print(f"  {len(enriched)} verses, {n_strongs_total} total Strong's "
          f"(avg {n_strongs_total / max(1, len(enriched)):.1f}/verse)",
          file=sys.stderr)

    # 2. DUMP target text
    print("Stage 2: fetching Italian RIV James 1 from live API...",
          file=sys.stderr, flush=True)
    target_text_by_verse = fetch_target_chapter(BOOK_ID, CHAPTER, TARGET_VERSION_KEY)
    target_path = SAMPLES_DIR / "riv_james1_target.json"
    target_path.write_text(json.dumps(target_text_by_verse, ensure_ascii=False, indent=2))
    print(f"  {len(target_text_by_verse)} verses pulled", file=sys.stderr)

    # 3. BUILD batch records
    print("Stage 3: building per-verse prompts...", file=sys.stderr, flush=True)
    batch_records: list[dict] = []
    for v in sorted(target_text_by_verse):
        if v not in enriched:
            continue
        verse_ref = f"{BOOK_NAME} {CHAPTER}:{v}"
        user_prompt = build_user_prompt(verse_ref, enriched[v], target_text_by_verse[v])
        rec = build_batch_record(
            custom_id=f"{TARGET_VERSION_KEY}:{BOOK_ID}:{CHAPTER}:{v}",
            system=SYSTEM_PROMPT,
            user=user_prompt,
        )
        batch_records.append(rec)
    batch_path = BATCHES_DIR / "riv_james1.jsonl"
    with batch_path.open("w") as f:
        for r in batch_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    prompts_path = SAMPLES_DIR / "riv_james1_prompts.jsonl"
    prompts_path.write_text(batch_path.read_text())  # mirror for visibility
    print(f"  {len(batch_records)} prompts -> {batch_path}", file=sys.stderr)

    if args.no_api:
        print("\n--no-api set; stopping after offline prep.", file=sys.stderr)
        print(f"\nReview the prompts at:\n  {batch_path}", file=sys.stderr)
        print(f"\nTo run for real, set ANTHROPIC_API_KEY and re-run without --no-api.",
              file=sys.stderr)
        return 0

    # 4. RUN
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("\nERROR: ANTHROPIC_API_KEY not set. Re-run with --no-api to build the "
              "prompts only, or export the key before re-running.", file=sys.stderr)
        return 2

    print(f"\nStage 4: calling {MODEL_ID} on {len(batch_records)} verses...",
          file=sys.stderr, flush=True)
    raw_results: list[dict] = []
    raw_path = RESULTS_DIR / "riv_james1_raw.jsonl"
    with raw_path.open("w") as f:
        for i, rec in enumerate(batch_records, 1):
            system = rec["params"]["system"][0]["text"]
            user = rec["params"]["messages"][0]["content"]
            try:
                resp = call_anthropic(system, user, api_key)
                text = extract_assistant_text(resp)
                parsed = parse_json_block(text)
                row = {
                    "custom_id": rec["custom_id"],
                    "model_picks": parsed.get("tokens", []),
                    "stop_reason": resp.get("stop_reason"),
                    "usage": resp.get("usage"),
                }
            except Exception as e:
                row = {"custom_id": rec["custom_id"], "error": f"{type(e).__name__}: {e}"}
            raw_results.append(row)
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            print(f"  [{i:2}/{len(batch_records)}] {rec['custom_id']}  "
                  f"{'OK' if 'error' not in row else 'ERR'}",
                  file=sys.stderr, flush=True)
            time.sleep(args.rate_limit_sleep)

    # 5. POST-PROCESS
    print("\nStage 5: post-processing model picks into canonical tokens...",
          file=sys.stderr, flush=True)
    tokens_by_verse: dict[int, list[dict]] = {}
    warnings_by_verse: dict[int, list[str]] = {}
    hallucination_drop_count = 0
    for row in raw_results:
        if "error" in row:
            continue
        # custom_id = VK:BOOK:CHAP:V
        _, _, _, v_str = row["custom_id"].split(":")
        v = int(v_str)
        target_text = target_text_by_verse[v]
        # Pre-filter: drop any pick whose Strong's isn't in this verse's
        # inventory. This is a HARD safety gate — the spec says <0.5% of
        # picks will hallucinate, and they're always near-neighbor errors
        # (e.g. G0284 picked when G0283 was the correct in-inventory choice).
        # We'd rather lose the tag than serve a Strong's the frontend can't
        # render against the lexicon.
        inv_set = {s["strongs"] for s in enriched.get(v, [])}
        filtered_picks = []
        for pick in row["model_picks"]:
            if pick.get("strongs") and pick["strongs"] not in inv_set:
                # Demote to a no-strongs pick so the surface still gets passthrough
                pick = {**pick, "strongs": None, "_hallucinated": pick["strongs"]}
                hallucination_drop_count += 1
            filtered_picks.append(pick)
        tokens, warns = post_process_picks(
            target_text, filtered_picks, args.confidence_floor)
        tokens_by_verse[v] = tokens
        if warns:
            warnings_by_verse[v] = warns
    if hallucination_drop_count:
        print(f"  dropped {hallucination_drop_count} hallucinated Strong's "
              f"(picks not in candidate inventory)", file=sys.stderr, flush=True)

    # 6. VALIDATE
    print("Stage 6: validating...", file=sys.stderr, flush=True)
    report_lines = [
        f"RIV James 1 LLM-alignment pilot",
        f"Model: {MODEL_ID}",
        f"Confidence floor: {args.confidence_floor}",
        "",
    ]
    pass_count, fail_count = 0, 0
    all_stats: list[dict] = []
    for v in sorted(tokens_by_verse):
        inventory_set = {s["strongs"] for s in enriched.get(v, [])}
        target_text = target_text_by_verse[v]
        ok, issues, stats = validate_verse(target_text, tokens_by_verse[v], inventory_set)
        all_stats.append(stats)
        if ok:
            pass_count += 1
            report_lines.append(
                f"{BOOK_NAME} 1:{v}  OK  "
                f"tokens={stats['n_tokens']} tagged={stats['n_tagged']} "
                f"avg_conf={stats['avg_confidence']}")
        else:
            fail_count += 1
            report_lines.append(f"{BOOK_NAME} 1:{v}  FAIL")
            for iss in issues:
                report_lines.append(f"    {iss}")
        if v in warnings_by_verse:
            for w in warnings_by_verse[v]:
                report_lines.append(f"    WARN {w}")

    # Aggregate
    report_lines += [
        "",
        f"Pass:  {pass_count}/{len(tokens_by_verse)}",
        f"Fail:  {fail_count}/{len(tokens_by_verse)}",
    ]
    if all_stats:
        avg_tagged = sum(s["n_tagged"] for s in all_stats) / len(all_stats)
        avg_conf_vals = [s["avg_confidence"] for s in all_stats if s["avg_confidence"] is not None]
        avg_conf = sum(avg_conf_vals) / len(avg_conf_vals) if avg_conf_vals else None
        report_lines.append(f"Avg tagged tokens / verse: {avg_tagged:.1f}")
        report_lines.append(f"Avg confidence: {avg_conf:.3f}" if avg_conf else "Avg confidence: n/a")

    report_path = SAMPLES_DIR / "riv_james1_report.txt"
    report_path.write_text("\n".join(report_lines))
    print("\n" + "\n".join(report_lines[-6:]), file=sys.stderr)

    # Emit final tokens JSONL
    tokens_jsonl = SAMPLES_DIR / "riv_james1_tokens.jsonl"
    with tokens_jsonl.open("w") as f:
        for v in sorted(tokens_by_verse):
            f.write(json.dumps({
                "version_key": TARGET_VERSION_KEY,
                "book_id": BOOK_ID,
                "chapter": CHAPTER,
                "verse_number": v,
                "tokens": tokens_by_verse[v],
            }, ensure_ascii=False) + "\n")
    print(f"\nFinal tokens -> {tokens_jsonl}", file=sys.stderr)
    print(f"Validation report -> {report_path}", file=sys.stderr)

    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
