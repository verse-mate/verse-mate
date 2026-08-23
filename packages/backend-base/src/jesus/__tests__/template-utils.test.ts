import { describe, expect, it } from "bun:test";

import { fillTemplate } from "../utils/template.utils";

describe("fillTemplate", () => {
  it("fills a placeholder", () => {
    expect(fillTemplate("Topic: {topic}", { topic: "Kingdom" })).toBe(
      "Topic: Kingdom",
    );
  });

  it("fills EVERY occurrence, not just the first", () => {
    // The bug this helper exists for: `.replace("{x}", v)` leaves the second
    // one as literal `{x}`, and a prompt with a visible placeholder still gets
    // an answer — so the failure is silent.
    expect(
      fillTemplate("what He {verb} … as He {verb} it", { verb: "said" }),
    ).toBe("what He said … as He said it");
  });

  it("leaves an unknown placeholder visible", () => {
    // Blanking it would read as missing data; leaving it shows the typo.
    expect(fillTemplate("A {known} and a {mystery}", { known: "x" })).toBe(
      "A x and a {mystery}",
    );
  });

  it("does not treat $-sequences in a value as substitution patterns", () => {
    // Scripture text and titles are not audited for dollar signs.
    expect(fillTemplate("{q}", { q: "worth $5 and $& and $`" })).toBe(
      "worth $5 and $& and $`",
    );
  });

  it("fills several distinct placeholders", () => {
    expect(fillTemplate("{a}/{b}/{a}", { a: "one", b: "two" })).toBe(
      "one/two/one",
    );
  });

  it("accepts an empty value without leaving the placeholder", () => {
    expect(fillTemplate("summary: {summary}.", { summary: "" })).toBe(
      "summary: .",
    );
  });

  it("ignores braces that are not placeholders", () => {
    expect(fillTemplate('{"facets":[]} and {topic}', { topic: "Faith" })).toBe(
      '{"facets":[]} and Faith',
    );
  });
});
