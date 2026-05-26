#!/usr/bin/env python3
"""
Ingest a CrossWire Strong's-tagged Bible into VerseMate's canonical token shape.

Supports any SWORD zText/OSIS module with `OSISStrongs` in its GlobalOptionFilter.
The translation registry (TRANSLATIONS dict, below) maps each of our backend
version_key values to the corresponding CrossWire module name.

Output: per-verse JSON token arrays matching the API contract from
multilingual-strongs-tagging-handoff.md. Joining all `text` fields of a verse's
tokens reproduces the verse exactly (lossless invariant).

Usage:
  ingest_strongs.py --version-key RVR09 [--module-path /tmp/sword/SpaRV1909]
                    --out-jsonl samples/rvr09_tokens.jsonl
                    --out-sql-postgres migrations/02_seed_rvr09_tokens.postgres.sql
                    --out-sql-sqlite  migrations/02_seed_rvr09_tokens.sqlite.sql
                    --smoke-test
                    [--verify-api]

Currently registered:
  RVR09  → SpaRV1909     (Spanish — Reina-Valera 1909 + Strong's)
  SCH51  → GerSch        (German  — Schlachter 1951 + Strong's)
  LSG    → FreSegond1910 (French  — Louis Segond 1910 + Strong's)
  SYN    → RusSynodalLIO (Russian — Synodal Bible Licht im Osten + Strong's)

Dependencies: pysword (pip install pysword). Stdlib only otherwise.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Iterator, List

try:
    from pysword.modules import SwordModules
    from pysword import bible as _pysword_bible
except ImportError:
    sys.stderr.write("pysword not installed. Run: pip install pysword\n")
    sys.exit(2)


# ─── Pysword performance patch ────────────────────────────────────────────────
#
# pysword's ZTextModule._decompressed_text re-reads + re-decompresses (+ re-
# decrypts via Sapphire if a CipherKey is set) the ENTIRE compressed block on
# every single verse fetch. With BlockType=BOOK there are only 66 blocks for
# a complete Bible, but iterating 31,102 verses without caching means 31,102
# re-decompressions of the SAME 66 blocks. Cost: 8+ minutes for a full ingest.
#
# Drop in a tiny per-module dict cache keyed on (id(self), testament, buf_num).
# The cache is small (66 entries max per Bible × a few MB each = ~30 MB peak),
# never evicts, and turns a multi-hour run into a 30-second one.
def _install_pysword_block_cache():
    """Monkey-patch ZTextModule._decompressed_text with a per-instance cache.

    Idempotent — safe to call multiple times. Returns the cache size after
    first patch (for visibility in logs).
    """
    orig = _pysword_bible.ZTextModule._decompressed_text
    if getattr(orig, "_patched_with_cache", False):
        return
    _cache: dict[tuple[int, str, int], bytes] = {}

    def cached(self, testament, buf_num):
        key = (id(self), testament, buf_num)
        hit = _cache.get(key)
        if hit is not None:
            return hit
        out = orig(self, testament, buf_num)
        _cache[key] = out
        return out

    cached._patched_with_cache = True
    cached._cache = _cache
    _pysword_bible.ZTextModule._decompressed_text = cached


_install_pysword_block_cache()

# ─── Text normalizers ────────────────────────────────────────────────────────
#
# Some CrossWire modules use typographic conventions that differ from the plain
# text we already store in our DB. Most commonly:
#
#   LSG: French typography — NBSPs ( ) and narrow NBSPs (  /  )
#        before colons/semicolons/exclamation marks. Pure rendering choice; the
#        text is identical character-by-character if you collapse them to ASCII
#        spaces.
#   SYN: Russian Synodal "LIO" edition adds leading whitespace, French-style
#        guillemets «...» around direct speech, and em-dashes — partially
#        normalizable; some verses have genuine textual variation that can't
#        be normalized away (skipped during seed).
#
# A normalizer is a string -> string function applied to every token's `text`
# field at emission time. It MUST be a strict simplification (never adds chars,
# never reorders) so the lossless-join invariant still holds against our DB.

def normalize_french_typography(s: str) -> str:
    """LSG: French NBSPs / narrow spaces → ASCII space, then strip spaces
    before all common punctuation, then collapse doubles.

    Why strip before all punctuation (`;:!?` + `,.`), not just French
    double-punctuation: the SWORD module wraps "implicit" Strong's lemmas
    around bare typographic spaces inside `<w>` tags (e.g. Hebrew ʾāmar
    "said" is often attached to a thin no-break space because there's no
    French surface word for it). After NBSP→space normalization those
    spaces leak in front of commas/periods too. Our served DB text strips
    them all.
    """
    s = s.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    s = re.sub(r" +([;:!?,.])", r"\1", s)
    s = re.sub(r"  +", " ", s)
    return s


def normalize_russian_lio(s: str) -> str:
    """SYN: strip the LIO edition's typographic flourishes that aren't textual.

    Verses with GENUINE textual variation (different content) still won't
    match — those get caught by --verify-api and skipped during seed.
    """
    # Strip leading whitespace runs (LIO adds 4-space indents on some verses).
    s = re.sub(r"^[ \t]+", "", s)
    # French-style guillemets « ... »  → bare text. They wrap direct speech
    # which our DB renders without quote marks.
    s = s.replace("«", "").replace("»", "")
    # Closing-quote variants the LIO uses inside sentences.
    s = s.replace("„", "").replace("“", "").replace("”", "")
    # Em-dash variants — LIO uses these as clause separators where our DB
    # uses colons. The colon→em-dash mapping is too ambiguous to do safely
    # in general (we'd corrupt verses that legitimately use em-dashes), so
    # we leave them. Affected verses get skipped at --verify-api time.
    return s


# Registry of normalizers by version_key. Default is identity (no-op).
TEXT_NORMALIZERS = {
    "LSG": normalize_french_typography,
    "SYN": normalize_russian_lio,
}


# ─── Translation registry ─────────────────────────────────────────────────────
#
# Maps each VerseMate version_key (returned by /bible/versions) to the CrossWire
# SWORD module name + a default unpacked path. Add new entries as more tagged
# languages come online. All currently registered modules are zText / OSIS /
# BlockType=BOOK with `OSISStrongs` in GlobalOptionFilter, which is what the
# parser below expects.

TRANSLATIONS: dict[str, dict] = {
    "RVR09": {
        "module": "SpaRV1909",
        "lang": "es",
        "name": "Reina-Valera 1909 + Strong's",
        "source_url": "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/SpaRV1909.zip",
        "license_note": "Base text PD; Strong's tagging by Rubén Gómez, "
                        "distributed via CrossWire.",
    },
    "SCH51": {
        "module": "GerSch",
        "lang": "de",
        "name": "Schlachter Bibel (1951) + Strong's",
        "source_url": "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/GerSch.zip",
        "license_note": "Copyrighted; free non-commercial distribution. "
                        "Confirm with legal before public ship.",
    },
    "LSG": {
        "module": "FreSegond1910",
        "lang": "fr",
        "name": "Louis Segond 1910 + Strong's",
        "source_url": "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/FreSegond1910.zip",
        "license_note": "Copyrighted; permission to distribute granted to CrossWire.",
    },
    "SYN": {
        "module": "RusSynodalLIO",
        "lang": "ru",
        "name": "Russian Synodal (Licht im Osten edition) + Strong's",
        "source_url": "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/RusSynodalLIO.zip",
        "license_note": "Copyrighted; permission to distribute granted to CrossWire. "
                        "LIO edition is a publisher-specific variant of Synodal — "
                        "verify with --verify-api before applying the seed.",
    },
}

# Maps pysword book identifiers to VerseMate book_id (1..66, canonical Protestant
# ordering — same as src/lib/bookSlugs.ts in verse-mate-web's worker.js).
BOOK_ORDER = [
    "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
    "joshua", "judges", "ruth", "i_samuel", "ii_samuel",
    "i_kings", "ii_kings", "i_chronicles", "ii_chronicles",
    "ezra", "nehemiah", "esther", "job", "psalms",
    "proverbs", "ecclesiastes", "song_of_solomon", "isaiah",
    "jeremiah", "lamentations", "ezekiel", "daniel",
    "hosea", "joel", "amos", "obadiah", "jonah", "micah",
    "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi",
    "matthew", "mark", "luke", "john", "acts",
    "romans", "i_corinthians", "ii_corinthians", "galatians",
    "ephesians", "philippians", "colossians",
    "i_thessalonians", "ii_thessalonians", "i_timothy",
    "ii_timothy", "titus", "philemon", "hebrews",
    "james", "i_peter", "ii_peter", "i_john",
    "ii_john", "iii_john", "jude", "revelation_of_john",
]
BOOK_ID_BY_PYSWORD = {name: i + 1 for i, name in enumerate(BOOK_ORDER)}

# ─── Strong's normalization ───────────────────────────────────────────────────
#
# Lexicon convention (verse-mate-lexicon, scripts/lexicon-ingest/build.py::parse_tbe):
#   G0001..G9999, H0001..H9999. Strip any disambiguator letter suffix at the base
#   (e.g. "G0007G" -> "G0007"). The SpaRV1909 source already uses 4-digit padded
#   form and we have not observed disambiguators in this module, but the rule is
#   implemented defensively in case Ruben updates the module.

_STRONG_RE = re.compile(r"(?i)strong\s*:\s*([GH])(\d+)([A-Za-z]?)")


def normalize_strongs(lemma_attr: str) -> List[str]:
    """Parse a `lemma="..."` attribute into a list of normalized Strong's IDs.

    Examples:
        "Strong:G2385"            -> ["G2385"]
        "strong:G2424 strong:G5547" -> ["G2424", "G5547"]
        "Strong:G7"               -> ["G0007"]
        "Strong:G0007G"           -> ["G0007"]   # disambiguator letter dropped
    """
    out: List[str] = []
    for prefix, digits, _disambiguator in _STRONG_RE.findall(lemma_attr or ""):
        num = int(digits)
        out.append(f"{prefix.upper()}{num:04d}")
    return out


# ─── OSIS fragment tokenizer ──────────────────────────────────────────────────
#
# pysword returns OSIS-lite fragments per verse. Vocabulary observed across the
# whole Bible (sampled OT + NT):
#   <w lemma="Strong:G####" [morph="..."]>text</w>   tagged content word
#   <transChange>text</transChange>                  translator-supplied word
#   <chapter osisID=".."/> <title>..</title>         stray chapter/section markers
#   bare text between tags (punctuation, names, small connectives)
#
# Strategy: regex-driven scanner. Faster + simpler than xml.etree for fragments
# this constrained, and tolerant of unmatched/unescaped chars that occasionally
# show up in legacy SWORD content.

# Captures one of:
#   group 'wopen'  start of <w ...>
#   group 'tcopen' start of <transChange ...>
#   group 'wclose' </w>
#   group 'tcclose' </transChange>
#   group 'self'   self-closing tag we want to discard (chapter, milestone, etc.)
#   group 'titleopen' <title>
#   group 'titleclose' </title>
_TOKEN_RE = re.compile(
    r"""(?xs)
    # ORDER MATTERS: alternation is leftmost-first. Put self-closing patterns
    # before their corresponding open-pattern, because the open-pattern's
    # greedy `[^>]*` would otherwise swallow the trailing `/` of `.../>`.
    (?P<w_selfclose> <w \s [^>]*/\s*> )         # <w lemma="..."/> — Strong's with no surface word
    | (?P<wopen> <w \s [^>]*> )
    | (?P<wopen_bare> <w> )
    | (?P<tcopen> <transChange (?:\s [^>]*)? > )
    | (?P<hi_open> <hi (?:\s [^>]*)? > )         # <hi type="bold">..</hi> emphasis (preserve inner)
    | (?P<wclose> </w> )
    | (?P<tcclose> </transChange> )
    | (?P<hi_close> </hi> )
    | (?P<self> < (?:chapter|milestone|verse|note|lb|seg|div|title|p|reference|q|closer|salute|signed|item|list|lg|l)\b [^>]* /\s*> )
    | (?P<discard_open> < (?:chapter|title|note|seg|div|reference|q|closer|salute|signed|item|list|lg|l)\b (?:\s [^>]*)? > )
    | (?P<discard_close> </ (?:chapter|title|note|seg|div|reference|q|closer|salute|signed|item|list|lg|l) > )
    """
)
_LEMMA_RE = re.compile(r'lemma\s*=\s*"([^"]*)"')


def parse_verse(raw_osis: str) -> List[dict]:
    """Turn one verse's raw OSIS fragment into ordered VerseMate tokens.

    Returns a list of dicts shaped per the API contract:
        {"text": "...", "strongs": "G2385"}    content word with Strong's
        {"text": "..."}                          passthrough (punctuation, transChange)

    Invariant: "".join(t["text"] for t in tokens) reconstructs the cleaned verse
    text byte-for-byte (after stripping any leakage markup like stray <chapter/>).
    """
    tokens: List[dict] = []
    pos = 0
    pending_text_parts: List[str] = []
    pending_strongs: List[str] | None = None  # None outside <w>, list inside
    discarding = 0  # nesting depth inside <title>/<note>/<chapter> blocks

    # NOTE on <transChange>: we deliberately treat <transChange>...</transChange>
    # as a no-op around its contents. Two reasons:
    #   1. The "translator-supplied word" interpretation (emit as passthrough
    #      with no strongs) is correct for `<transChange>su</transChange>` —
    #      bare text inside → flush_passthrough already produces an untagged
    #      passthrough token. No special state needed.
    #   2. transChange can ALSO wrap nested <w> tags carrying real Strong's
    #      (e.g. 2 Chronicles 3:3: `<transChange><w lemma="H4055">son las
    #      medidas</w> <w lemma="H0834">de que</w></transChange>`). Suppressing
    #      these would lose the tagging AND break the lossless-join invariant
    #      because the bare spaces between inner <w> tags would be discarded.
    # So <transChange>/</transChange> are matched only to be skipped — the
    # inner content speaks for itself.

    def flush_passthrough(text: str) -> None:
        """Merge consecutive passthrough text into one token to keep the list tidy."""
        if not text:
            return
        if tokens and "strongs" not in tokens[-1] and "kind" not in tokens[-1]:
            tokens[-1]["text"] += text
        else:
            tokens.append({"text": text})

    for m in _TOKEN_RE.finditer(raw_osis):
        # Bare text between tags
        bare = raw_osis[pos:m.start()]
        if bare:
            if discarding:
                pass  # inside <title>/<note>/<chapter> — drop
            elif pending_strongs is not None:
                pending_text_parts.append(bare)
            else:
                flush_passthrough(bare)
        pos = m.end()

        if m.group("wopen") or m.group("wopen_bare"):
            lemma_match = _LEMMA_RE.search(m.group(0)) if m.group("wopen") else None
            pending_strongs = normalize_strongs(lemma_match.group(1) if lemma_match else "")
            pending_text_parts = []
        elif m.group("wclose"):
            text = "".join(pending_text_parts)
            if text:
                # Whitespace-only <w> content: a Strong's number attached to
                # nothing tappable (e.g. implicit Hebrew verbs whose French
                # surface is a thin no-break space, common in LSG). Emit
                # as PASSTHROUGH so the whitespace stays in the joined output
                # (matching pysword's clean=True view), but drop the Strong's
                # tag — there's no tappable surface for it.
                if not text.strip():
                    flush_passthrough(text)
                    pending_strongs = None
                    pending_text_parts = []
                    continue
                tok: dict = {"text": text}
                if pending_strongs:
                    # Contract is a single `strongs` string; if the source ties
                    # multiple Strong's to one surface word (e.g. "Jesucristo" =
                    # G2424 + G5547), we record the first and stash the rest in
                    # `strongs_alt` for callers that want to surface them. The
                    # frontend renderer ignores unknown keys.
                    tok["strongs"] = pending_strongs[0]
                    if len(pending_strongs) > 1:
                        tok["strongs_alt"] = pending_strongs[1:]
                    tokens.append(tok)
                else:
                    flush_passthrough(text)
            pending_strongs = None
            pending_text_parts = []
        elif m.group("tcopen") or m.group("tcclose"):
            pass  # <transChange> tags are no-ops; inner <w>/bare text handles itself
        elif m.group("hi_open") or m.group("hi_close"):
            pass  # <hi>...</hi> emphasis — inner text is real, surrounding tags are no-ops
        elif m.group("w_selfclose"):
            pass  # <w lemma="..."/> — Strong's marker with no surface text. Drop.
        elif m.group("self"):
            pass  # drop self-closing markers
        elif m.group("discard_open"):
            discarding += 1
        elif m.group("discard_close"):
            if discarding:
                discarding -= 1

    # Trailing bare text after the last tag
    trailing = raw_osis[pos:]
    if trailing and not discarding:
        if pending_strongs is not None:
            pending_text_parts.append(trailing)
        else:
            flush_passthrough(trailing)

    # If we ended mid-tag (malformed input), flush whatever we accumulated
    if pending_strongs is not None and pending_text_parts:
        flush_passthrough("".join(pending_text_parts))

    # Trim trailing whitespace on the very last token. pysword sometimes leaks a
    # whitespace gap between the last <w> and end-of-book/chapter markers like
    # <div eID=".." type="book"/>; the marker is stripped but the gap stays as
    # a bare-text passthrough, breaking byte-for-byte parity with our stored
    # `text` column (no trailing whitespace).
    while tokens and not tokens[-1]["text"].rstrip():
        tokens.pop()
    if tokens:
        tokens[-1]["text"] = tokens[-1]["text"].rstrip()
        if "strongs" not in tokens[-1] and not tokens[-1]["text"]:
            tokens.pop()

    return tokens


# ─── Iteration ────────────────────────────────────────────────────────────────


def iter_verses(module_path: str, module_name: str, version_key: str,
                only_book: int | None = None,
                only_chapter: int | None = None) -> Iterator[dict]:
    """Yield {book_id, chapter, verse_number, tokens, joined_text} for each verse."""
    mods = SwordModules(module_path)
    mods.parse_modules()
    bible = mods.get_bible_from_module(module_name)
    structure = bible.get_structure()

    for testament in ("ot", "nt"):
        books = getattr(structure, f"{testament}_books", None)
        if books is None:
            # Older pysword API: books are under a `books` dict keyed by testament
            books = structure.get_books().get(testament, [])
        for book in books:
            pysword_name = getattr(book, "name", None) or book["name"]
            normalized = pysword_name.lower().replace(" ", "_")
            book_id = BOOK_ID_BY_PYSWORD.get(normalized)
            if book_id is None:
                sys.stderr.write(f"WARN unknown book {pysword_name!r}, skipping\n")
                continue
            if only_book is not None and book_id != only_book:
                continue

            chapter_lengths = getattr(book, "chapter_lengths", None) or book["chapter_lengths"]
            for ch_idx, verse_count in enumerate(chapter_lengths, start=1):
                if only_chapter is not None and ch_idx != only_chapter:
                    continue
                for v in range(1, verse_count + 1):
                    raw = bible.get(books=[pysword_name.lower()], chapters=[ch_idx],
                                    verses=[v], clean=False)
                    if not raw:
                        continue
                    raw = raw.strip()
                    # Apply per-language text normalizer to the raw OSIS BEFORE
                    # tokenizing. Operating on the whole string lets the
                    # normalizer fix sequences that cross token boundaries
                    # (e.g. "word\xa0" + ":" → "word" + ":" instead of two
                    # tokens that each look fine but join to the wrong string).
                    # The normalizer only ever shortens text — never adds chars
                    # — so OSIS tag structure is preserved.
                    normalizer = TEXT_NORMALIZERS.get(version_key)
                    if normalizer is not None:
                        raw = normalizer(raw)
                    tokens = parse_verse(raw)
                    joined = "".join(t["text"] for t in tokens)
                    clean = bible.get(books=[pysword_name.lower()],
                                      chapters=[ch_idx], verses=[v]).strip()
                    if normalizer is not None:
                        clean = normalizer(clean)
                    yield {
                        "version_key": version_key,
                        "book_id": book_id,
                        "chapter": ch_idx,
                        "verse_number": v,
                        "tokens": tokens,
                        "_clean_text": clean,
                        "_joined_text": joined,
                    }


# ─── Output writers ───────────────────────────────────────────────────────────


def is_safe_to_seed(row: dict, api_text_index: dict | None = None) -> bool:
    """A row is safe to seed iff its joined tokens reproduce the AUTHORITATIVE
    text byte-for-byte. Authoritative = the live API's `text` field if we have
    it (the DB is the source of truth for what users see); otherwise the
    source module's own clean text (source-internal consistency as a fallback).

    Any drift means the seed would emit a different string on the wire vs the
    legacy {verseNumber, text} shape for the same verse — we'd rather leave
    the verse untagged than have the wire-level text disagree depending on
    whether the client asks for tagged=1 or not.
    """
    joined = row["_joined_text"]
    if api_text_index is not None:
        key = (row["book_id"], row["chapter"], row["verse_number"])
        api_text = api_text_index.get(key)
        if api_text is None:
            return False  # API doesn't have this verse — don't seed it
        return api_text == joined
    return row["_clean_text"] == joined


def fetch_api_texts_for_rows(rows: List[dict], version_key: str,
                             base_url: str = "https://api.versemate.org") -> dict:
    """Pre-fetch the live API for every distinct (book, chapter) in `rows` and
    return a {(book, chapter, verse): text} index. Used by --seed-only-api-match
    to gate the seed on live-API match (not just source-internal consistency).

    ~1,189 HTTP calls for a whole-Bible scope. The API is normally fast so
    this takes a couple minutes; the ingest already takes 10s so total ~3 min.
    """
    chapters = sorted({(r["book_id"], r["chapter"]) for r in rows})
    idx: dict = {}
    total = len(chapters)
    for i, (bk, ch) in enumerate(chapters):
        if i % 100 == 0:
            print(f"  api fetch: {i}/{total} chapters...",
                  file=sys.stderr, flush=True)
        try:
            verses = fetch_api_chapter(bk, ch, base_url, version_key)
        except Exception as e:
            print(f"  WARN api err {bk}/{ch}: {e}", file=sys.stderr)
            continue
        for vn, text in verses.items():
            idx[(bk, ch, vn)] = text
    return idx


def write_jsonl(rows: Iterator[dict], path: Path,
                api_text_index: dict | None = None) -> tuple[int, int]:
    """Returns (written, skipped_due_to_drift)."""
    n, skipped = 0, 0
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            if not is_safe_to_seed(row, api_text_index):
                skipped += 1
                continue
            out = {
                "version_key": row["version_key"],
                "book_id": row["book_id"],
                "chapter": row["chapter"],
                "verse_number": row["verse_number"],
                "tokens": row["tokens"],
            }
            f.write(json.dumps(out, ensure_ascii=False) + "\n")
            n += 1
    return n, skipped


def write_sql_update(rows: Iterator[dict], path: Path, dialect: str,
                     api_text_index: dict | None = None) -> tuple[int, int]:
    """Emit UPDATE statements for verses that pass the lossless-join invariant.
    Verses where source joined != clean are SKIPPED — they stay untagged in the
    DB (NULL tokens column) and the API falls back to the legacy text shape.

    dialect is 'postgres' or 'sqlite'.
    Postgres uses JSONB literal: tokens = '...'::jsonb
    SQLite uses TEXT: tokens = '...'

    Returns (written, skipped_due_to_drift).
    """
    n, skipped = 0, 0
    with path.open("w", encoding="utf-8") as f:
        f.write(f"-- Generated by ingest_strongs.py for {dialect}\n")
        f.write("-- Skipped verses keep tokens IS NULL → API falls back to legacy shape.\n")
        f.write("BEGIN;\n")
        for row in rows:
            if not is_safe_to_seed(row, api_text_index):
                skipped += 1
                continue
            tokens_json = json.dumps(row["tokens"], ensure_ascii=False).replace("'", "''")
            if dialect == "postgres":
                literal = f"'{tokens_json}'::jsonb"
            else:
                literal = f"'{tokens_json}'"
            f.write(
                f"UPDATE bible_verse SET tokens = {literal} "
                f"WHERE version_key = '{row['version_key']}' "
                f"AND book_id = {row['book_id']} "
                f"AND chapter = {row['chapter']} "
                f"AND verse_number = {row['verse_number']};\n"
            )
            n += 1
        f.write("COMMIT;\n")
    return n, skipped


# ─── Live-API drift check ─────────────────────────────────────────────────────
#
# The seed SQL only writes the `tokens` column — the existing DB `text` column
# we already serve is the source of truth for what shows on screen. The API
# contract requires that joining all token `text` fields reproduces the printed
# verse exactly. So before applying the seed, confirm that the SOURCE'S clean
# text (which becomes the joined tokens) matches what the API already returns
# for that verse. Any drift = that verse should be skipped, not tagged.

DEFAULT_API_BASE = "https://api.versemate.org"


def fetch_api_chapter(book_id: int, chapter: int,
                      base_url: str = DEFAULT_API_BASE,
                      version_key: str = "RVR09") -> dict[int, str]:
    """Fetch one chapter from the live API. Returns {verse_number: text}."""
    url = f"{base_url}/bible/book/{book_id}/{chapter}?bible_version={version_key}"
    with urllib.request.urlopen(url, timeout=20) as resp:
        data = json.load(resp)
    chapters = data["book"]["chapters"]
    if not chapters:
        return {}
    return {v["verseNumber"]: v["text"] for v in chapters[0]["verses"]}


def verify_against_api(rows: List[dict], version_key: str,
                       sample_books: List[int] | None = None,
                       base_url: str = DEFAULT_API_BASE,
                       sample_one_chapter_per_book: bool = False) -> tuple[int, List[str], List[str]]:
    """Spot-check joined tokens against the live API per chapter.

    sample_books = None  -> verify every (book, chapter) in rows. Slow (~1,189
                            HTTP calls for whole-Bible scope) but exhaustive.
    sample_books = [59]  -> verify only James.
    sample_one_chapter_per_book = True -> verify just one chapter from each
                            book in scope (66 calls instead of 1,189). Useful
                            for fast pre-seed sanity checks across the Bible.

    Returns (verses_checked, drift_failures, drift_warnings).
    drift_failures = source clean text ≠ API text (would corrupt the wire).
                     Those verses must be skipped during seed.
    drift_warnings = source emits a verse the API doesn't (or vice versa);
                     informational, doesn't break the seed but worth knowing.
    """
    idx: dict[tuple[int, int, int], dict] = {}
    chapters_seen: dict[int, list[int]] = {}  # book_id -> sorted chapter list
    for r in rows:
        idx[(r["book_id"], r["chapter"], r["verse_number"])] = r
        chapters_seen.setdefault(r["book_id"], [])
        if r["chapter"] not in chapters_seen[r["book_id"]]:
            chapters_seen[r["book_id"]].append(r["chapter"])

    if sample_books is not None:
        chapters_seen = {bk: chs for bk, chs in chapters_seen.items()
                         if bk in sample_books}

    if sample_one_chapter_per_book:
        # Pick the first chapter from each book — keeps the HTTP cost to 66.
        chapters_seen = {bk: [min(chs)] for bk, chs in chapters_seen.items()}

    chapter_pairs = sorted(
        (bk, ch) for bk, chs in chapters_seen.items() for ch in sorted(chs)
    )

    failures: list[str] = []
    warnings: list[str] = []
    checked = 0
    for (book_id, chapter) in chapter_pairs:
        try:
            api_verses = fetch_api_chapter(book_id, chapter, base_url, version_key)
        except Exception as e:
            warnings.append(f"  API ERR {book_id}/{chapter}: {e}")
            continue
        for vn, api_text in api_verses.items():
            row = idx.get((book_id, chapter, vn))
            if row is None:
                warnings.append(f"  SOURCE MISSING {book_id}/{chapter}:{vn}  "
                                f"(API has verse, source does not)")
                continue
            joined = "".join(t["text"] for t in row["tokens"])
            checked += 1
            if api_text != joined:
                failures.append(
                    f"  DRIFT {book_id}/{chapter}:{vn}\n"
                    f"    api    : {api_text!r}\n"
                    f"    source : {joined!r}"
                )
    return checked, failures, warnings


# ─── Smoke-test ───────────────────────────────────────────────────────────────


def smoke_test(rows: Iterator[dict]) -> tuple[int, list[str], list[str]]:
    """Verify lossless-join (hard) + tagging coverage (soft).

    Hard failures = join mismatch (the API's lossless-join invariant is broken).
    Soft warnings = low Strong's count (verse has < 5 tagged tokens; common for
                    short genealogies / one-line verses where < 5 content words
                    exist to begin with).

    Returns (verses_checked, hard_failures, soft_warnings).
    """
    hard: list[str] = []
    soft: list[str] = []
    n = 0
    for row in rows:
        n += 1
        clean = row["_clean_text"]
        joined = row["_joined_text"]
        # Normalize whitespace differences (pysword may collapse spaces inside
        # tag boundaries differently in clean mode).
        if re.sub(r"\s+", " ", clean).strip() != re.sub(r"\s+", " ", joined).strip():
            hard.append(
                f"  JOIN MISMATCH {row['book_id']}/{row['chapter']}:{row['verse_number']}\n"
                f"    clean : {clean!r}\n"
                f"    joined: {joined!r}"
            )
        n_strong = sum(1 for t in row["tokens"] if "strongs" in t)
        if n_strong < 5:
            soft.append(
                f"  LOW STRONG COUNT {row['book_id']}/{row['chapter']}:{row['verse_number']} "
                f"only {n_strong} tagged tokens"
            )
    return n, hard, soft


# ─── CLI ──────────────────────────────────────────────────────────────────────


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--version-key", required=True,
                   help=f"VerseMate version_key. Registered: {', '.join(TRANSLATIONS)}")
    p.add_argument("--module-path", default=None,
                   help="Path to unpacked SWORD module directory. "
                        "Defaults to /tmp/sword/<module_name>.")
    p.add_argument("--module-name", default=None,
                   help="Override the registered SWORD module name (for testing "
                        "an alternate tagged source for the same version_key).")
    p.add_argument("--book", type=int, default=None,
                   help="Restrict to one book_id (1..66).")
    p.add_argument("--chapter", type=int, default=None,
                   help="Restrict to one chapter (requires --book).")
    p.add_argument("--out-jsonl", type=Path, default=None)
    p.add_argument("--out-sql-postgres", type=Path, default=None)
    p.add_argument("--out-sql-sqlite", type=Path, default=None)
    p.add_argument("--seed-only-api-match", action="store_true",
                   help="Before writing the seed, fetch the live API for every "
                        "chapter in scope and skip any verse where source's joined "
                        "tokens don't match the API text byte-for-byte. "
                        "Recommended for the final seed run — keeps the wire-level "
                        "contract that joined tokens reproduce db.text exactly. "
                        "Adds ~2-3 min of HTTP fetch time for a whole-Bible scope.")
    p.add_argument("--out-sample-json", type=Path, default=None,
                   help="Emit a single API-shaped sample (mimics the /bible/book/.. response).")
    p.add_argument("--smoke-test", action="store_true",
                   help="Run lossless-join + min-Strong's check. Hard failures break the API "
                        "contract; soft warnings are informational.")
    p.add_argument("--verify-api", action="store_true",
                   help="Diff source joined-tokens against the LIVE api.versemate.org. "
                        "Combined with --book = one book; with no scope = the whole Bible "
                        "(slow, 1,189 HTTP calls); with --sample-api = one chapter per book "
                        "(fast, 66 HTTP calls).")
    p.add_argument("--sample-api", action="store_true",
                   help="When using --verify-api, only check the first chapter of each book.")
    p.add_argument("--api-base", default=DEFAULT_API_BASE,
                   help="API base URL for --verify-api. Default: %(default)s")
    args = p.parse_args()

    if args.version_key not in TRANSLATIONS:
        print(f"error: --version-key '{args.version_key}' is not registered. "
              f"Known: {', '.join(TRANSLATIONS)}", file=sys.stderr)
        return 2

    cfg = TRANSLATIONS[args.version_key]
    module_name = args.module_name or cfg["module"]
    module_path = args.module_path or f"/tmp/sword/{module_name}"
    print(f"ingesting {args.version_key} ({cfg['name']}) from {module_path}",
          file=sys.stderr, flush=True)

    # Stream the source once into memory, with progress logging. pysword per-verse
    # get() is the slow path even with the block cache patched in (small constant
    # per-verse parse cost). 31k rows ~ 30 MB, well within memory.
    all_rows: list[dict] = []
    last_log = 0
    for row in iter_verses(module_path, module_name, args.version_key,
                           args.book, args.chapter):
        all_rows.append(row)
        if len(all_rows) - last_log >= 5000:
            print(f"  loaded {len(all_rows)} verses...", file=sys.stderr, flush=True)
            last_log = len(all_rows)
    print(f"loaded {len(all_rows)} verses from source", file=sys.stderr, flush=True)

    # Pre-fetch live API for seed-gating if requested
    api_text_index: dict | None = None
    if args.seed_only_api_match and (args.out_jsonl or args.out_sql_postgres or args.out_sql_sqlite):
        print(f"pre-fetching live API texts from {args.api_base}...",
              file=sys.stderr, flush=True)
        api_text_index = fetch_api_texts_for_rows(all_rows, args.version_key, args.api_base)
        print(f"  fetched {len(api_text_index)} verses from API",
              file=sys.stderr, flush=True)

    if args.out_jsonl:
        n, skipped = write_jsonl(iter(all_rows), args.out_jsonl, api_text_index)
        print(f"wrote {n} verses -> {args.out_jsonl}"
              + (f"  ({skipped} skipped due to drift)" if skipped else ""))
    if args.out_sql_postgres:
        n, skipped = write_sql_update(iter(all_rows), args.out_sql_postgres, "postgres", api_text_index)
        print(f"wrote {n} UPDATE statements -> {args.out_sql_postgres}"
              + (f"  ({skipped} skipped due to drift)" if skipped else ""))
    if args.out_sql_sqlite:
        n, skipped = write_sql_update(iter(all_rows), args.out_sql_sqlite, "sqlite", api_text_index)
        print(f"wrote {n} UPDATE statements -> {args.out_sql_sqlite}"
              + (f"  ({skipped} skipped due to drift)" if skipped else ""))
    if args.out_sample_json and all_rows:
        first = all_rows[0]
        verses = [{"verseNumber": r["verse_number"], "tokens": r["tokens"]}
                  for r in all_rows]
        wrapper = {
            "book": {
                "bookId": first["book_id"],
                "chapters": [{"chapterNumber": first["chapter"], "verses": verses}],
            }
        }
        args.out_sample_json.write_text(
            json.dumps(wrapper, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"wrote sample API response -> {args.out_sample_json}")

    if args.smoke_test:
        n, hard, soft = smoke_test(iter(all_rows))
        print(f"smoke-test: {n} verses checked, "
              f"{len(hard)} hard failures (join mismatch), "
              f"{len(soft)} soft warnings (low Strong's count)")
        if hard:
            print("HARD FAILURES (these break the API contract):")
            for f in hard[:50]:
                print(f)
        if soft:
            # Only show first 5 — these are typically short genealogy verses
            # where the source has fewer than 5 content words to tag.
            print(f"first {min(5, len(soft))} soft warnings (informational):")
            for f in soft[:5]:
                print(f)
        if hard:
            return 1

    if args.verify_api:
        sample_books = [args.book] if args.book is not None else None
        n, failures, warnings = verify_against_api(
            all_rows, args.version_key, sample_books, args.api_base,
            sample_one_chapter_per_book=args.sample_api,
        )
        print(f"verify-api: {n} verses checked vs {args.api_base}, "
              f"{len(failures)} drift failures, {len(warnings)} warnings")
        if failures:
            print("DRIFT (source ≠ live API — these verses must be SKIPPED in the seed):")
            for f in failures[:30]:
                print(f)
            if len(failures) > 30:
                print(f"  ... and {len(failures) - 30} more")
        if warnings:
            print(f"first {min(5, len(warnings))} warnings (informational):")
            for w in warnings[:5]:
                print(w)
        if failures:
            return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
