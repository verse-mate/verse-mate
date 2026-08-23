import { describe, expect, it } from "bun:test";

import {
  extractQuotations,
  validateTopicBrief,
} from "../utils/generation-validation";

const BOOK_NAMES = ["Matthew", "Mark", "Luke", "John", "Revelation"];
const CHAPTER_COUNTS = new Map([
  ["Matthew", 28],
  ["Mark", 16],
  ["Luke", 24],
  ["John", 21],
  ["Revelation", 22],
]);

/** The sayings a Kingdom/Teachings brief would have been given. */
const SOURCE =
  "unless one is born again he cannot see the kingdom of God · " +
  "The Sabbath was made for man, and not man for the Sabbath · " +
  "The kingdom of heaven is like a mustard seed";

const ALLOWED = ["john|3", "mark|2", "matthew|13"];

function check(content: string, overrides: Record<string, unknown> = {}) {
  return validateTopicBrief({
    content,
    bookNames: BOOK_NAMES,
    chapterCounts: CHAPTER_COUNTS,
    allowedReferences: ALLOWED,
    sourceText: SOURCE,
    ...overrides,
  });
}

/** A brief of the right length that breaks no rule, for the negative cases. */
const GOOD =
  "He treats the Kingdom as something entered rather than achieved, and the " +
  "entry He describes is a birth nobody arranges for themselves. Where the " +
  "religious expectation is scale and enforcement, He reaches for a seed and " +
  "for a Sabbath made to serve people rather than to be served by them.";

describe("validateTopicBrief", () => {
  it("accepts a grounded brief", () => {
    expect(check(GOOD)).toEqual([]);
  });

  it("accepts a quotation that is actually one of the sayings", () => {
    const issues = check(
      `${GOOD} The demand is put plainly: "unless one is born again he cannot see the kingdom of God".`,
    );
    expect(issues).toEqual([]);
  });

  it("rejects a quotation that is not among this topic's sayings", () => {
    const issues = check(
      `${GOOD} He puts it plainly: "the kingdom of God is within you".`,
    );
    expect(issues.map((i) => i.rule)).toContain("quotation-grounded");
  });

  it("does not read a possessive as a quotation", () => {
    // "the Father's house" would fail every brief that used a possessive if
    // apostrophes counted as quote marks.
    expect(
      check(`${GOOD} It is the Father's reign, not a party's platform.`),
    ).toEqual([]);
  });

  it("allows a reference inside the topic's own passages", () => {
    expect(check(`${GOOD} The clearest case is John 3.`)).toEqual([]);
  });

  it("rejects a reference the generator never showed it", () => {
    const issues = check(`${GOOD} It anticipates the throne of Revelation 21.`);
    expect(issues.map((i) => i.rule)).toContain("reference-scope");
  });

  it("does not mistake a number in prose for a citation", () => {
    // Matthew has 28 chapters, so "Matthew 100" is not a reference at all.
    expect(
      check(`${GOOD} The yields differ — Matthew 100, sixty, thirty.`),
    ).toEqual([]);
  });

  it("rejects a brief too short to say anything", () => {
    expect(check("He teaches about the Kingdom.").map((i) => i.rule)).toContain(
      "min-length",
    );
  });

  it("rejects a brief that runs to an essay", () => {
    const issues = check(GOOD.repeat(6));
    expect(issues.map((i) => i.rule)).toContain("max-length");
  });

  it("rejects a refusal", () => {
    const issues = check(
      "I'm sorry, I cannot provide a summary of these teachings without more context about what you are looking for here.",
    );
    expect(issues.map((i) => i.rule)).toContain("refusal");
  });

  it("rejects empty content", () => {
    expect(check("   ").map((i) => i.rule)).toEqual(["non-empty"]);
  });
});

describe("extractQuotations", () => {
  it("finds straight and curly quotations", () => {
    expect(extractQuotations('He said "born again" is required.')).toEqual([
      "born again",
    ]);
    expect(extractQuotations("He said “made for man” of it.")).toEqual([
      "made for man",
    ]);
  });

  it("ignores a single scare-quoted word", () => {
    // Naming a term is not a claim to be reproducing a saying.
    expect(extractQuotations('the so-called "Kingdom" of the day')).toEqual([]);
  });

  it("ignores apostrophes", () => {
    expect(
      extractQuotations("the Father's reign and the disciples' hope"),
    ).toEqual([]);
  });

  it("finds every quotation in the text", () => {
    expect(
      extractQuotations('First "born again", then "made for man".'),
    ).toEqual(["born again", "made for man"]);
  });

  it("returns nothing for unquoted prose", () => {
    expect(extractQuotations(GOOD)).toEqual([]);
  });
});
