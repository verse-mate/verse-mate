import { describe, expect, it } from "bun:test";

import { JESUS_FACET_TYPES } from "../jesus.constants";
import {
  extractReferences,
  findOutOfScopeReferences,
  isQuotationGrounded,
  normalizeForMatch,
  referenceKey,
  validateExtraction,
  validateNarrative,
} from "../utils/generation-validation";

const BOOKS = [
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "1 John",
  "Romans",
  "1 Corinthians",
  "Genesis",
  "Psalms",
];

/** Mark 4:39-40, the text a storm-event extraction would be given. */
const STORM_TEXT =
  "And He got up and rebuked the wind and said to the sea, “Hush, be still.” " +
  "And the wind died down and it became perfectly calm. And He said to them, " +
  "“Why are you afraid? Do you still have no faith?”";

describe("extractReferences", () => {
  it("finds a chapter reference", () => {
    expect(extractReferences("as in Mark 4 the storm stills", BOOKS)).toEqual([
      { book: "Mark", chapter: 4, verse: undefined },
    ]);
  });

  it("finds a chapter:verse reference", () => {
    expect(extractReferences("see Mark 4:39", BOOKS)).toEqual([
      { book: "Mark", chapter: 4, verse: 39 },
    ]);
  });

  it("prefers the longest book name so 1 John is not read as John", () => {
    // The classic failure: matching "John" inside "1 John" would attribute the
    // reference to the wrong book and let a genuinely out-of-scope citation
    // slip through the scope gate.
    expect(extractReferences("1 John 4:8 says", BOOKS)).toEqual([
      { book: "1 John", chapter: 4, verse: 8 },
    ]);
  });

  it("finds several references in one passage of prose", () => {
    const found = extractReferences("Matthew 8:23 and Luke 8:22 agree", BOOKS);
    expect(found.map((r) => `${r.book} ${r.chapter}`)).toEqual([
      "Matthew 8",
      "Luke 8",
    ]);
  });

  it("returns nothing for prose with no references", () => {
    expect(extractReferences("He rebuked the wind.", BOOKS)).toEqual([]);
    expect(extractReferences("", BOOKS)).toEqual([]);
  });
});

describe("findOutOfScopeReferences", () => {
  const allowed = [referenceKey("Matthew", 8), referenceKey("Mark", 4)];

  it("passes references inside the event's accounts", () => {
    expect(
      findOutOfScopeReferences("Mark 4:39 and Matthew 8:26", BOOKS, allowed),
    ).toEqual([]);
  });

  it("flags a reference the model wandered into", () => {
    const stray = findOutOfScopeReferences(
      "compare Romans 8:28 for the same idea",
      BOOKS,
      allowed,
    );
    expect(stray).toHaveLength(1);
    expect(stray[0].book).toBe("Romans");
  });

  it("flags the right chapter of an in-scope book", () => {
    // Mark is in scope, but Mark 5 is a different event.
    const stray = findOutOfScopeReferences("see Mark 5:1", BOOKS, allowed);
    expect(stray.map((r) => `${r.book} ${r.chapter}`)).toEqual(["Mark 5"]);
  });
});

describe("normalizeForMatch", () => {
  it("folds case, curly quotes and punctuation", () => {
    expect(normalizeForMatch("“Hush, be still.”")).toBe("hush be still");
  });

  it("collapses whitespace", () => {
    expect(normalizeForMatch("  Peace!\n\n  Be   still  ")).toBe(
      "peace be still",
    );
  });
});

describe("isQuotationGrounded", () => {
  it("accepts an exact quotation from the passage", () => {
    expect(isQuotationGrounded("Hush, be still.", STORM_TEXT)).toBe(true);
  });

  it("accepts a quotation that differs only in punctuation or case", () => {
    expect(isQuotationGrounded('"HUSH BE STILL"', STORM_TEXT)).toBe(true);
  });

  it("accepts an elided quotation when every fragment is present", () => {
    expect(
      isQuotationGrounded("Why are you afraid? … no faith?", STORM_TEXT),
    ).toBe(true);
  });

  it("rejects a plausible saying that is not in the passage", () => {
    // This is the gate that matters: it sounds like Jesus and is not there.
    expect(
      isQuotationGrounded(
        "O you of little faith, why did you doubt?",
        STORM_TEXT,
      ),
    ).toBe(false);
  });

  it("rejects an elided quotation whose fabricated half is absent", () => {
    expect(
      isQuotationGrounded(
        "Why are you afraid? … I have overcome the world",
        STORM_TEXT,
      ),
    ).toBe(false);
  });

  it("rejects against empty source text", () => {
    expect(isQuotationGrounded("Hush, be still.", "")).toBe(false);
  });
});

describe("validateNarrative", () => {
  const base = {
    bookNames: BOOKS,
    allowedReferences: [referenceKey("Mark", 4)],
  };

  it("accepts sound content", () => {
    expect(
      validateNarrative({
        ...base,
        type: "overview",
        content:
          "A squall swamps the boat on the Sea of Galilee while Jesus sleeps in the stern. He rebukes the wind, and the disciples are left asking who this is.",
      }),
    ).toEqual([]);
  });

  it("rejects empty content", () => {
    const issues = validateNarrative({
      ...base,
      type: "overview",
      content: "  ",
    });
    expect(issues.map((i) => i.rule)).toEqual(["non-empty"]);
  });

  it("rejects content that is too short to be an overview", () => {
    const issues = validateNarrative({
      ...base,
      type: "overview",
      content: "A storm.",
    });
    expect(issues.map((i) => i.rule)).toContain("min-length");
  });

  it("rejects a refusal", () => {
    const issues = validateNarrative({
      ...base,
      type: "overview",
      content:
        "I'm sorry, I cannot provide an analysis of this passage without more information about the context you need.",
    });
    expect(issues.map((i) => i.rule)).toContain("refusal");
  });

  it("rejects an overview that cites outside the event", () => {
    const issues = validateNarrative({
      ...base,
      type: "overview",
      content:
        "A squall swamps the boat while Jesus sleeps in the stern; compare Romans 8:28 on providence, which speaks to the same theme of trust.",
    });
    expect(issues.map((i) => i.rule)).toContain("reference-scope");
  });

  it("allows insights to cite the wider canon", () => {
    // Scope is enforced on overview and compare only — drawing on other
    // scripture is the point of the Insights tab.
    const issues = validateNarrative({
      ...base,
      type: "insights",
      content:
        "The stilling of the sea echoes Psalms 107:29, where God alone quiets the waters, and so presses the disciples' question about who He is.",
    });
    expect(issues).toEqual([]);
  });
});

describe("validateExtraction", () => {
  const allowedTypes = JESUS_FACET_TYPES;

  it("accepts a grounded WORD facet", () => {
    const { valid, rejected } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [
        {
          mode: "WORD",
          type: "COMMAND",
          speaker: "JESUS",
          title: "Hush, be still",
          text: "Hush, be still.",
        },
      ],
    });
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rejects a fabricated saying even when it sounds right", () => {
    const { valid, rejected } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [
        {
          mode: "WORD",
          type: "QUESTION",
          speaker: "JESUS",
          title: "O you of little faith",
          text: "O you of little faith, why did you doubt?",
        },
      ],
    });
    expect(valid).toHaveLength(0);
    expect(rejected[0].issues.map((i) => i.rule)).toContain(
      "quotation-grounded",
    );
  });

  it("accepts an ACTION facet without string-matching it", () => {
    // Actions are described rather than quoted, so they are not matched — they
    // are stored at level 2 instead.
    const { valid } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [
        {
          mode: "ACTION",
          type: "MIRACLE",
          actor: "JESUS",
          title: "Rebukes the wind and the sea",
        },
      ],
    });
    expect(valid).toHaveLength(1);
  });

  it("requires a speaker on a WORD facet and an actor on an ACTION facet", () => {
    const { rejected } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [
        {
          mode: "WORD",
          type: "COMMAND",
          title: "Hush",
          text: "Hush, be still.",
        },
        { mode: "ACTION", type: "MIRACLE", title: "Rebukes the wind" },
      ],
    });
    expect(rejected).toHaveLength(2);
    expect(rejected[0].issues.map((i) => i.rule)).toContain("speaker");
    expect(rejected[1].issues.map((i) => i.rule)).toContain("actor");
  });

  it("rejects an unknown facet type", () => {
    const { rejected } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [
        {
          mode: "ACTION",
          type: "SERMON",
          actor: "JESUS",
          title: "Something",
        },
      ],
    });
    expect(rejected[0].issues.map((i) => i.rule)).toContain("type");
  });

  it("keeps the good facets when one in a batch is bad", () => {
    const { valid, rejected } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [
        {
          mode: "WORD",
          type: "QUESTION",
          speaker: "JESUS",
          title: "Why are you afraid?",
          text: "Why are you afraid?",
        },
        {
          mode: "WORD",
          type: "CLAIM",
          speaker: "JESUS",
          title: "Invented",
          text: "I am the light of the world.",
        },
      ],
    });
    expect(valid).toHaveLength(1);
    expect(valid[0].title).toBe("Why are you afraid?");
    expect(rejected).toHaveLength(1);
  });

  it("handles an empty extraction", () => {
    const { valid, rejected } = validateExtraction({
      sourceText: STORM_TEXT,
      allowedTypes,
      facets: [],
    });
    expect(valid).toEqual([]);
    expect(rejected).toEqual([]);
  });
});
