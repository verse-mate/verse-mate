#!/usr/bin/env python3
"""
Translate the ~2,166 loaded lemmas into N target languages via the
Anthropic Message Batches API.

Reads the English baseline emitted by extract_baseline.py:
  out/lemma_translations.jsonl   (language_code="en", source="lexicon-en")

Builds one batch request per (strongs × target language). For each, the
model receives the English entry as the source-of-truth + translation
instructions targeting one specific language, and returns:

  {
    "pos": "<translated>",
    "basic_gloss": "<translated>",
    "semantic_range": ["<translated>", ...],
    "notes": "<translated>",
    "related": [{"translit": "<unchanged>", "note": "<translated>"}, ...]
  }

`translit` (transliteration slug) stays in Latin script — it's a lookup
key, not user-facing prose.

Cost: ~$0.001 per request at Haiku 4.5 batch pricing.
  2,166 lemmas × 10 langs × $0.001 ≈ $22.
Wall clock: usually 30-90 min batch processing for a job this size.

Output: lemma_translations.jsonl (additive — append to or replace whatever
the loader picks up).

Usage:
  python3 translate_batch.py --baseline ./out/lemma_translations.jsonl \\
                             --langs es,de,fr,ru,it,pt,ro,hi,tl,uk \\
                             --out-dir ./out \\
                             [--no-api | --submit | --status | --collect | --run]

Same lifecycle commands as tagalog_full_batch.py — --run does submit + poll
+ collect in one shot.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL_ID = "claude-haiku-4-5"
MAX_TOKENS = 2048
API_BASE = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"

LANG_LABELS = {
    "es": "Spanish (es)",
    "de": "German (de)",
    "fr": "French (fr)",
    "ru": "Russian (ru)",
    "it": "Italian (it)",
    "pt": "Portuguese (pt)",
    "ro": "Romanian (ro)",
    "hi": "Hindi (hi, Devanagari script)",
    "tl": "Tagalog (tl)",
    "uk": "Ukrainian (uk, Cyrillic script)",
}

SYSTEM_PROMPT = """You translate biblical-lexicon entries from English into a \
specific target language. Each request gives you ONE entry — Greek/Hebrew \
lemma, transliteration, Strong's number, English definition fields — and \
asks you to render the translatable fields in the target language.

Rules:
1. Translate naturally for a Bible-reading audience in the target language. \
Don't transliterate when a native equivalent exists.
2. Keep the meaning faithful — these are scholarly definitions, not paraphrases. \
Don't add interpretation. Don't drop nuance.
3. For proper nouns (people, places), use the target-language CONVENTIONAL \
spelling: "James" → "Santiago" in Spanish, "Jacques" in French, "Иаков" in \
Russian, "Якуб" in Tagalog. Use the form a Bible-reading user would expect.
4. Preserve the original script for the lemma itself (Ἰάκωβος stays Ἰάκωβος). \
Preserve `translit` slugs unchanged (they're DB lookup keys, not prose).
5. semantic_range elements should each be 5-15 words in the target language, \
matching the granularity of the English source.
6. notes should be 1-3 sentences. Translate the meaning, not the word order.
7. For Hindi: respond in Devanagari script. For Russian/Ukrainian: Cyrillic. \
For Tagalog: Latin script (modern Tagalog convention).

Return ONLY JSON, no prose, no code fence. Schema:
{
  "pos": "<translated part-of-speech label>",
  "basic_gloss": "<1-10 word translated headword>",
  "semantic_range": ["<sense 1>", "<sense 2>", ...],
  "notes": "<translated 1-3 sentence note>",
  "related": [{"translit": "<unchanged-slug>", "note": "<translated>"}, ...]
}

Fields the English entry doesn't have? Omit them from the response."""


def _api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    return re.sub(r"\s+", "", key)


def _api_request(method: str, path: str, body: bytes | None = None) -> bytes:
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        method=method,
        data=body,
        headers={
            "x-api-key": _api_key(),
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {text}") from e


def submit_batch(records: list[dict]) -> str:
    payload = json.dumps({"requests": records}).encode()
    data = json.loads(_api_request("POST", "/messages/batches", payload))
    if not data.get("id"):
        raise RuntimeError(f"submit_batch missing id: {data}")
    return data["id"]


def get_batch_status(batch_id: str) -> dict:
    return json.loads(_api_request("GET", f"/messages/batches/{batch_id}"))


def stream_batch_results(batch_id: str) -> list[dict]:
    raw = _api_request("GET", f"/messages/batches/{batch_id}/results")
    rows = []
    for line in raw.decode("utf-8", errors="replace").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def build_user_prompt(en_entry: dict, lang_label: str) -> str:
    return (
        f"Source entry (English):\n"
        f"{json.dumps(en_entry, ensure_ascii=False, indent=2)}\n\n"
        f"Translate the translatable fields into: {lang_label}\n\n"
        f"Return the JSON now."
    )


def build_records(baseline_path: Path, langs: list[str]) -> list[dict]:
    baseline: list[dict] = []
    for line in baseline_path.open(encoding="utf-8"):
        if line.strip():
            baseline.append(json.loads(line))
    print(f"  loaded {len(baseline)} English baseline entries", file=sys.stderr)

    records: list[dict] = []
    for entry in baseline:
        strongs = entry["strongs"]
        # The source row we hand to the model — strip the DB-only fields.
        en_payload = {
            "strongs": strongs,
            "lemma": entry.get("lemma", ""),  # carried from lemmas.jsonl below
            "pos": entry.get("pos"),
            "basic_gloss": entry.get("basic_gloss"),
            "semantic_range": entry.get("semantic_range"),
            "notes": entry.get("notes"),
            "related": entry.get("related"),
        }
        for lang in langs:
            lang_label = LANG_LABELS.get(lang, lang)
            user_prompt = build_user_prompt(en_payload, lang_label)
            records.append(
                {
                    "custom_id": f"{strongs}_{lang}",
                    "params": {
                        "model": MODEL_ID,
                        "max_tokens": MAX_TOKENS,
                        "system": [
                            {
                                "type": "text",
                                "text": SYSTEM_PROMPT,
                                "cache_control": {"type": "ephemeral"},
                            }
                        ],
                        "messages": [{"role": "user", "content": user_prompt}],
                    },
                }
            )
    return records


def collect(batch_id: str, out_path: Path) -> tuple[int, int, int]:
    print("streaming batch results...", file=sys.stderr, flush=True)
    rows = stream_batch_results(batch_id)
    print(f"  {len(rows)} result rows", file=sys.stderr)

    ok = parse_fail = api_err = 0
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            custom_id = row.get("custom_id") or ""
            result = row.get("result") or {}
            if result.get("type") != "succeeded":
                api_err += 1
                continue
            message = result.get("message") or {}
            blocks = message.get("content") or []
            text = "".join(
                b.get("text", "") for b in blocks if b.get("type") == "text"
            ).strip()
            if text.startswith("```"):
                text = text.removeprefix("```json").removeprefix("```").strip()
                text = text.removesuffix("```").strip()
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parse_fail += 1
                continue
            # custom_id = "<strongs>_<lang>"; rsplit handles G####/H#### + lang.
            parts = custom_id.rsplit("_", 1)
            if len(parts) != 2:
                parse_fail += 1
                continue
            strongs, lang = parts
            out_row = {
                "strongs": strongs,
                "language_code": lang,
                "pos": parsed.get("pos"),
                "basic_gloss": parsed.get("basic_gloss"),
                "semantic_range": parsed.get("semantic_range"),
                "notes": parsed.get("notes"),
                "related": parsed.get("related"),
                "source": f"llm:{MODEL_ID}",
            }
            f.write(json.dumps(out_row, ensure_ascii=False) + "\n")
            ok += 1
    return ok, parse_fail, api_err


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--baseline", required=True, type=Path,
                    help="English baseline JSONL from extract_baseline.py")
    ap.add_argument("--langs", default="es,de,fr,ru,it,pt,ro,hi,tl,uk",
                    help="Comma-separated target language codes")
    ap.add_argument("--out-dir", required=True, type=Path)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--no-api", action="store_true")
    mode.add_argument("--submit", action="store_true")
    mode.add_argument("--status", action="store_true")
    mode.add_argument("--collect", action="store_true")
    mode.add_argument("--run", action="store_true")
    ap.add_argument("--poll-interval", type=float, default=120.0)
    args = ap.parse_args()
    args.out_dir.mkdir(exist_ok=True, parents=True)

    langs = [s.strip() for s in args.langs.split(",") if s.strip()]
    state_file = args.out_dir / ".batch_id"
    batch_jsonl = args.out_dir / "translate_batch.jsonl"
    out_translations = args.out_dir / "lemma_translations.llm.jsonl"

    # Build records (offline)
    records = build_records(args.baseline, langs)
    print(f"\n  built {len(records)} batch records "
          f"({len(records) // len(langs)} lemmas × {len(langs)} langs)",
          file=sys.stderr)
    with batch_jsonl.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    size_mb = batch_jsonl.stat().st_size / (1024 * 1024)
    cost = len(records) * (701 * 0.50 + 327 * 2.50) / 1_000_000
    print(f"  wrote {batch_jsonl} ({size_mb:.1f} MB)", file=sys.stderr)
    print(f"  cost estimate: ${cost:.2f} batch (Haiku 4.5)", file=sys.stderr)

    if args.no_api:
        print("\n--no-api: stopping after offline prep", file=sys.stderr)
        return 0

    cached = state_file.read_text().strip() if state_file.exists() else None

    if args.status:
        if not cached:
            print("no cached batch_id", file=sys.stderr)
            return 1
        print(json.dumps(get_batch_status(cached), indent=2))
        return 0

    if args.submit:
        if cached:
            print(f"batch already submitted: {cached}", file=sys.stderr)
            return 0
        batch_id = submit_batch(records)
        state_file.write_text(batch_id)
        print(f"submitted batch {batch_id} -> {state_file}", file=sys.stderr)
        return 0

    if args.collect:
        if not cached:
            print("no cached batch_id; submit first", file=sys.stderr)
            return 1
        status = get_batch_status(cached)
        if status.get("processing_status") != "ended":
            print(f"batch not ended: {status.get('processing_status')}",
                  file=sys.stderr)
            return 1
        ok, parse_fail, api_err = collect(cached, out_translations)
        print(f"\n  wrote {ok} translations -> {out_translations}",
              file=sys.stderr)
        print(f"  parse failures: {parse_fail}  api errors: {api_err}",
              file=sys.stderr)
        return 0

    if args.run:
        if cached:
            batch_id = cached
            print(f"resuming cached batch {batch_id}", file=sys.stderr)
        else:
            batch_id = submit_batch(records)
            state_file.write_text(batch_id)
            print(f"submitted batch {batch_id}", file=sys.stderr)
        while True:
            status = get_batch_status(batch_id)
            ps = status.get("processing_status", "?")
            c = status.get("request_counts", {})
            print(
                f"  {ps:12s}  processing={c.get('processing', 0):5d}  "
                f"succeeded={c.get('succeeded', 0):5d}  "
                f"errored={c.get('errored', 0):5d}",
                file=sys.stderr, flush=True,
            )
            if ps == "ended":
                break
            if ps in ("canceled", "expired"):
                print(f"batch ended non-success: {ps}", file=sys.stderr)
                return 2
            time.sleep(args.poll_interval)
        ok, parse_fail, api_err = collect(batch_id, out_translations)
        print(f"\n  wrote {ok} translations -> {out_translations}",
              file=sys.stderr)
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
