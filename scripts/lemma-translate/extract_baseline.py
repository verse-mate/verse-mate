#!/usr/bin/env python3
"""
Extract the lemma seed for the backend loader.

Schema convention: English baseline lives on the `lemmas` row directly
(same as `topics.name` for English topic names); non-English rows go in
`lemma_translations`. This script only produces `lemmas.jsonl` — the
non-English rows come from translate_batch.py.

Reads `@versemate/lexicon`'s generated `_lemmas.json` (~18K entries, keyed
on slug) and emits ONE file:

  lemmas.jsonl   — all 18,083 rows. Universal fields populated for every
                   row. English baseline fields (pos, basic_gloss,
                   semantic_range, notes, related) populated for ~2,166
                   loaded entries; null for the long-tail untapped 16K.

Usage:
  python3 extract_baseline.py \\
    --lemmas-json /path/to/verse-mate-web/src/data/lexicon/generated/_lemmas.json \\
    --out-dir ./out

Outputs:
  ./out/lemmas.jsonl
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path


def normalize_strongs(raw):
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
        "--english-content-for-non-loaded",
        action="store_true",
        help="Also write the English baseline (pos, basic_gloss, ...) for "
             "non-loaded lemmas. Default leaves them null since the frontend "
             "filter never surfaces them anyway.",
    )
    args = ap.parse_args()
    args.out_dir.mkdir(exist_ok=True, parents=True)

    raw = json.loads(args.lemmas_json.read_text())
    print(f"Read {len(raw)} entries from {args.lemmas_json}")

    lemmas_out = args.out_dir / "lemmas.jsonl"
    n_lemmas = 0
    n_with_english = 0
    n_skipped_invalid_strongs = 0
    seen_strongs = set()

    with lemmas_out.open("w") as f:
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
            loaded = bool(entry.get("loaded"))
            include_english = loaded or args.english_content_for_non_loaded
            related = entry.get("related") or []
            related_normalized = [
                {"translit": r.get("translit", ""), "note": r.get("note", "")}
                for r in related
                if isinstance(r, dict)
            ] or None

            row = {
                "strongs": s,
                "lemma": entry.get("lemma", ""),
                "translit": entry.get("translit"),
                "pronunciation": entry.get("pronunciation"),
                "nt_frequency": entry.get("ntFrequency"),
                "ot_frequency": entry.get("otFrequency"),
                "loaded": loaded,
            }
            if include_english:
                row["pos"] = entry.get("pos")
                row["basic_gloss"] = entry.get("basicGloss")
                row["semantic_range"] = entry.get("semanticRange")
                row["notes"] = entry.get("notes")
                row["related"] = related_normalized
                n_with_english += 1
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n_lemmas += 1

    print(f"\nWrote {n_lemmas:,} rows -> {lemmas_out}")
    print(f"  with English baseline content: {n_with_english:,}")
    print(f"  universal-only (long tail): {n_lemmas - n_with_english:,}")
    if n_skipped_invalid_strongs:
        print(f"Skipped {n_skipped_invalid_strongs} entries with unparseable strongs")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
