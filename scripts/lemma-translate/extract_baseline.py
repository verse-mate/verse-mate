#!/usr/bin/env python3
"""
Extract the English baseline rows for the lemma seed loader.

Reads `@versemate/lexicon`'s generated `_lemmas.json` (~18K entries, keyed
on slug) and emits two JSONL files consumed by
`apps/backend/src/ingest-lemmas.ts`:

  lemmas.jsonl              — universal fields, 1 row per Strong's. Includes
                              ALL entries (whether `loaded` or not) so the
                              FK from lemma_translations always resolves.
  lemma_translations.jsonl  — English translation rows, 1 per Strong's.
                              Filtered to `loaded=true` only by default —
                              that's the user-tappable subset the LLM batch
                              also targets. Pass --all to include everything.

The English rows here become the fallback for languages we haven't
translated yet, AND the source the LLM-translation script reads from when
building target-language prompts.

Usage:
  python3 extract_baseline.py \
    --lemmas-json /path/to/verse-mate-web/src/data/lexicon/generated/_lemmas.json \
    --out-dir ./out

Outputs:
  ./out/lemmas.jsonl
  ./out/lemma_translations.jsonl   (English rows, source="lexicon-en")
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path


def normalize_strongs(raw: str | None) -> str | None:
    """G80 → G0080, G0007a → G0007. Matches the backend's parse_tbe
    convention so tokens.strongs in verses.tokens joins cleanly."""
    if not raw:
        return None
    m = re.match(r"^([GH])(\d+)([A-Za-z]?)$", raw.strip())
    if not m:
        return None
    return f"{m.group(1)}{int(m.group(2)):04d}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lemmas-json", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument(
        "--all",
        action="store_true",
        help="Emit lemma_translations rows for non-loaded entries too. Default "
             "filters to loaded=true (the ~2,166 tap-worthy subset).",
    )
    args = ap.parse_args()
    args.out_dir.mkdir(exist_ok=True, parents=True)

    raw = json.loads(args.lemmas_json.read_text())
    print(f"Read {len(raw)} entries from {args.lemmas_json}")

    lemmas_out = args.out_dir / "lemmas.jsonl"
    trans_out = args.out_dir / "lemma_translations.jsonl"

    n_lemmas = 0
    n_trans = 0
    n_skipped_invalid_strongs = 0
    # Track which strongs we've emitted so duplicates (different slugs
    # pointing to same Strong's) don't try to insert twice.
    seen_strongs: set[str] = set()

    with lemmas_out.open("w") as fl, trans_out.open("w") as ft:
        for slug, entry in raw.items():
            if not isinstance(entry, dict):
                continue
            s = normalize_strongs(entry.get("strongs"))
            if s is None:
                n_skipped_invalid_strongs += 1
                continue
            if s in seen_strongs:
                continue
            seen_strongs.add(s)

            # Universal row
            fl.write(json.dumps({
                "strongs": s,
                "lemma": entry.get("lemma", ""),
                "translit": entry.get("translit"),
                "pronunciation": entry.get("pronunciation"),
                "nt_frequency": entry.get("ntFrequency"),
                "ot_frequency": entry.get("otFrequency"),
                "loaded": bool(entry.get("loaded")),
            }, ensure_ascii=False) + "\n")
            n_lemmas += 1

            # English translation row — only emit for loaded entries (or all)
            if entry.get("loaded") or args.all:
                related = entry.get("related") or []
                related_normalized = [
                    {"translit": r.get("translit", ""), "note": r.get("note", "")}
                    for r in related
                    if isinstance(r, dict)
                ]
                # NB: we include `lemma` here even though the schema column
                # lives on `lemmas` (not lemma_translations). The translator
                # script reads this file directly and needs the Greek/Hebrew
                # script visible to make proper-noun spelling decisions
                # ("Ἰάκωβος" → "Santiago" not "Iakōbos"). The loader ignores
                # any extra fields, so this is harmless for ingest.
                ft.write(json.dumps({
                    "strongs": s,
                    "language_code": "en",
                    "lemma": entry.get("lemma", ""),
                    "pos": entry.get("pos"),
                    "basic_gloss": entry.get("basicGloss"),
                    "semantic_range": entry.get("semanticRange"),
                    "notes": entry.get("notes"),
                    "related": related_normalized or None,
                    "source": "lexicon-en",
                }, ensure_ascii=False) + "\n")
                n_trans += 1

    print(f"\nWrote {n_lemmas:,} universal rows -> {lemmas_out}")
    print(f"Wrote {n_trans:,} English translation rows -> {trans_out}")
    if n_skipped_invalid_strongs:
        print(f"Skipped {n_skipped_invalid_strongs} entries with unparseable strongs")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
