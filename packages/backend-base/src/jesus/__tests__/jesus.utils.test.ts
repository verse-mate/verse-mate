import { describe, expect, it } from "bun:test";

import {
  JESUS_KINDS,
  JESUS_KIND_META,
  JESUS_SECTIONS,
  JESUS_SECTION_META,
  getKindFromSlug,
  getKindsForSection,
  isJesusKind,
  isJesusSection,
  resolveKindFilter,
} from "../jesus.constants";
import {
  formatReference,
  formatReferenceList,
  generateEntrySlug,
  generateUniqueEntrySlug,
  parseReference,
} from "../utils/reference.utils";

describe("Jesus taxonomy", () => {
  it("gives every kind a slug, a section and a label", () => {
    for (const kind of JESUS_KINDS) {
      const meta = JESUS_KIND_META[kind];
      expect(meta).toBeDefined();
      expect(meta.slug).toMatch(/^[a-z-]+$/);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.singular.length).toBeGreaterThan(0);
      expect(JESUS_SECTIONS).toContain(meta.section);
    }
  });

  it("assigns every kind to exactly one section", () => {
    const seen = new Map<string, string>();
    for (const section of JESUS_SECTIONS) {
      for (const kind of JESUS_SECTION_META[section].kinds) {
        expect(seen.has(kind)).toBe(false);
        seen.set(kind, section);
      }
    }
    // Every kind is claimed — no kind can be orphaned out of the hub.
    expect(seen.size).toBe(JESUS_KINDS.length);
  });

  it("keeps section membership and kind metadata in agreement", () => {
    for (const section of JESUS_SECTIONS) {
      for (const kind of JESUS_SECTION_META[section].kinds) {
        expect(JESUS_KIND_META[kind].section).toBe(section);
      }
    }
  });

  it("gives every kind a unique slug", () => {
    const slugs = JESUS_KINDS.map((k) => JESUS_KIND_META[k].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("round-trips a kind through its slug", () => {
    for (const kind of JESUS_KINDS) {
      expect(getKindFromSlug(JESUS_KIND_META[kind].slug)).toBe(kind);
    }
  });

  it("returns null for an unknown kind slug", () => {
    expect(getKindFromSlug("sermons")).toBeNull();
    expect(getKindFromSlug("")).toBeNull();
  });

  it("matches kind slugs case-insensitively", () => {
    expect(getKindFromSlug("MIRACLES")).toBe("MIRACLE");
  });

  it("validates kinds and sections", () => {
    expect(isJesusKind("PARABLE")).toBe(true);
    expect(isJesusKind("parable")).toBe(false);
    expect(isJesusSection("words")).toBe(true);
    expect(isJesusSection("sayings")).toBe(false);
  });

  it("resolves the kinds behind a section", () => {
    expect(getKindsForSection("words")).toEqual([
      "TEACHING",
      "QUESTION",
      "COMMAND",
      "CLAIM",
    ]);
    expect(getKindsForSection("parables")).toEqual(["PARABLE"]);
  });
});

describe("resolveKindFilter", () => {
  it("returns undefined when neither kind nor section is given", () => {
    // Distinct from an empty array: this means "don't filter on kind at all".
    expect(resolveKindFilter({})).toBeUndefined();
  });

  it("resolves a stored kind", () => {
    expect(resolveKindFilter({ kind: "MIRACLE" })).toEqual(["MIRACLE"]);
  });

  it("resolves a kind from its URL slug", () => {
    expect(resolveKindFilter({ kind: "miracles" })).toEqual(["MIRACLE"]);
    expect(resolveKindFilter({ kind: "questions" })).toEqual(["QUESTION"]);
  });

  it("resolves a section to its kinds", () => {
    expect(resolveKindFilter({ section: "actions" })).toEqual([
      "MIRACLE",
      "HEALING",
      "ENCOUNTER",
      "COMPASSION",
      "CONFRONTATION",
    ]);
  });

  it("is case-insensitive on both params", () => {
    expect(resolveKindFilter({ kind: "miracle" })).toEqual(["MIRACLE"]);
    expect(resolveKindFilter({ section: "WORDS" })).toEqual([
      "TEACHING",
      "QUESTION",
      "COMMAND",
      "CLAIM",
    ]);
  });

  it("prefers kind over section when both are supplied", () => {
    expect(resolveKindFilter({ kind: "parables", section: "words" })).toEqual([
      "PARABLE",
    ]);
  });

  it("narrows to nothing on an unknown kind or section", () => {
    // Regression: an empty array must not be read as "no filter" downstream —
    // answering a typo with the whole corpus looks like everything matched.
    expect(resolveKindFilter({ kind: "nonsense" })).toEqual([]);
    expect(resolveKindFilter({ section: "sayings" })).toEqual([]);
  });
});

describe("formatReference", () => {
  it("renders a single verse", () => {
    expect(
      formatReference({
        book_name: "John",
        chapter: 8,
        verse_start: 12,
        verse_end: 12,
      }),
    ).toBe("John 8:12");
  });

  it("renders a verse range", () => {
    expect(
      formatReference({
        book_name: "Mark",
        chapter: 4,
        verse_start: 35,
        verse_end: 41,
      }),
    ).toBe("Mark 4:35-41");
  });

  it("renders a whole chapter when there is no verse bound", () => {
    expect(
      formatReference({
        book_name: "Matthew",
        chapter: 24,
        verse_start: null,
        verse_end: null,
      }),
    ).toBe("Matthew 24");
  });

  it("collapses a range whose end is missing into a single verse", () => {
    expect(
      formatReference({ book_name: "Luke", chapter: 19, verse_start: 10 }),
    ).toBe("Luke 19:10");
  });

  it("joins an entry's references into a card byline", () => {
    expect(
      formatReferenceList([
        { book_name: "Matthew", chapter: 8, verse_start: 23, verse_end: 27 },
        { book_name: "Mark", chapter: 4, verse_start: 35, verse_end: 41 },
        { book_name: "Luke", chapter: 8, verse_start: 22, verse_end: 25 },
      ]),
    ).toBe("Matthew 8:23-27 · Mark 4:35-41 · Luke 8:22-25");
  });
});

describe("parseReference", () => {
  it("parses a single verse", () => {
    expect(parseReference("John 8:12")).toEqual({
      book: "John",
      chapter: 8,
      verse_start: 12,
      verse_end: 12,
    });
  });

  it("parses a verse range", () => {
    expect(parseReference("Mark 4:35-41")).toEqual({
      book: "Mark",
      chapter: 4,
      verse_start: 35,
      verse_end: 41,
    });
  });

  it("parses a whole-chapter reference", () => {
    expect(parseReference("Matthew 24")).toEqual({
      book: "Matthew",
      chapter: 24,
      verse_start: null,
      verse_end: null,
    });
  });

  it("parses a book name that leads with a numeral", () => {
    expect(parseReference("1 Corinthians 15:3-8")).toEqual({
      book: "1 Corinthians",
      chapter: 15,
      verse_start: 3,
      verse_end: 8,
    });
  });

  it("parses a multi-word book name", () => {
    expect(parseReference("Song of Solomon 2:1")).toEqual({
      book: "Song of Solomon",
      chapter: 2,
      verse_start: 1,
      verse_end: 1,
    });
  });

  it("returns null rather than guessing at unparseable input", () => {
    expect(parseReference("somewhere in the gospels")).toBeNull();
    expect(parseReference("")).toBeNull();
  });

  it("round-trips through formatReference", () => {
    for (const input of [
      "John 8:12",
      "Mark 4:35-41",
      "Matthew 24",
      "1 Corinthians 15:3-8",
    ]) {
      const parsed = parseReference(input);
      expect(parsed).not.toBeNull();
      expect(
        formatReference({
          book_name: (parsed as NonNullable<typeof parsed>).book,
          chapter: (parsed as NonNullable<typeof parsed>).chapter,
          verse_start: (parsed as NonNullable<typeof parsed>).verse_start,
          verse_end: (parsed as NonNullable<typeof parsed>).verse_end,
        }),
      ).toBe(input);
    }
  });
});

describe("entry slugs", () => {
  it("slugifies a title", () => {
    expect(generateEntrySlug("The Good Samaritan")).toBe("the-good-samaritan");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(generateEntrySlug("I am the way, the truth, and the life")).toBe(
      "i-am-the-way-the-truth-and-the-life",
    );
    expect(generateEntrySlug("God's Love")).toBe("gods-love");
  });

  it("collapses whitespace and trims stray hyphens", () => {
    expect(generateEntrySlug("  Extra   Spaces  ")).toBe("extra-spaces");
    expect(generateEntrySlug("— Dashes —")).toBe("dashes");
  });

  it("leaves a free slug untouched", () => {
    expect(generateUniqueEntrySlug("the-sower", ["parable-of-the-sower"])).toBe(
      "the-sower",
    );
  });

  it("suffixes until the slug is free", () => {
    expect(generateUniqueEntrySlug("the-sower", ["the-sower"])).toBe(
      "the-sower-2",
    );
    expect(
      generateUniqueEntrySlug("the-sower", ["the-sower", "the-sower-2"]),
    ).toBe("the-sower-3");
  });
});
