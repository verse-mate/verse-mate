import { describe, expect, it } from "bun:test";
import { scrubEvent, stripQuery } from "../lib/analytics/privacy";

describe("what reaches analytics from the website", () => {
  it("drops the query and fragment from a URL", () => {
    expect(stripQuery("https://versemate.org/give/?utm_source=x#top")).toBe(
      "https://versemate.org/give/",
    );
    expect(stripQuery("/coach/?s=r")).toBe("/coach/");
  });

  it("scrubs every URL property and drops search properties", () => {
    const out = scrubEvent({
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url:
          "https://versemate.org/give/?utm_source=newsletter&email=a%40b.org#top",
        $referrer: "https://mail.test/?leader=l1",
        $pathname: "/give/",
        search: "?utm_source=newsletter",
        $search: "?x",
        other: "kept",
      },
      $set_once: {
        $initial_current_url: "https://versemate.org/give/?email=a%40b.org",
      },
    });
    expect(out?.properties).toEqual({
      $current_url: "https://versemate.org/give/",
      $referrer: "https://mail.test/",
      $pathname: "/give/",
      other: "kept",
    });
    expect(out?.$set_once).toEqual({
      $initial_current_url: "https://versemate.org/give/",
    });
  });

  it("strips queries embedded in free text", () => {
    const out = scrubEvent({
      uuid: "u",
      event: "$autocapture",
      properties: { $el_text: 'see <a href="https://x.test/p?token=1">' },
    });
    expect(String(out?.properties.$el_text)).not.toContain("token");
  });

  it("bounds campaign values on events and on the person", () => {
    const out = scrubEvent({
      uuid: "u",
      event: "$pageview",
      properties: {
        utm_content: "jane@example.com",
        utm_campaign: "a".repeat(150),
        utm_source: "newsletter",
      },
      $set_once: { $initial_utm_content: "jane@example.com" },
      $set: { utm_term: "write to jane@example.com" },
    });
    expect(out?.properties.utm_content).toBe("[redacted]");
    expect(out?.properties.utm_campaign).toBe("a".repeat(100));
    expect(out?.properties.utm_source).toBe("newsletter");
    expect(out?.$set_once?.$initial_utm_content).toBe("[redacted]");
    expect(out?.$set?.utm_term).toBe("[redacted]");
  });
});
