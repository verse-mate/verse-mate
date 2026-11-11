import { describe, expect, it } from "bun:test";
import { scrubEvent } from "../lib/analytics/privacy";

describe("what reaches analytics from the website", () => {
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
        $session_entry_utm_content: "jane@example.com",
      },
      $set_once: { $initial_utm_content: "jane@example.com" },
      $set: { utm_term: "write to jane@example.com" },
    });
    expect(out?.properties.utm_content).toBe("[redacted]");
    expect(out?.properties.utm_campaign).toBe("a".repeat(100));
    expect(out?.properties.utm_source).toBe("newsletter");
    expect(out?.properties.$session_entry_utm_content).toBe("[redacted]");
    expect(out?.$set_once?.$initial_utm_content).toBe("[redacted]");
    expect(out?.$set?.utm_term).toBe("[redacted]");
  });

  it("drops search keywords PostHog lifts from a search referrer", () => {
    const out = scrubEvent({
      uuid: "u",
      event: "$pageview",
      properties: { $session_entry_ph_keyword: "jane smith", kept: 1 },
      $set_once: { $initial_ph_keyword: "jane smith" },
    });
    expect(out?.properties).toEqual({ kept: 1 });
    expect(out?.$set_once).toEqual({});
  });

  it("keys heatmap clicks by the address without its query", () => {
    const out = scrubEvent({
      uuid: "u",
      event: "$$heatmap",
      properties: {
        $heatmap_data: {
          "https://versemate.org/give/?email=a%40b.org#top": [{ x: 1 }],
          "https://versemate.org/give/": [{ x: 2 }],
          "https://versemate.org/x": "bad",
        },
      },
    });
    expect(out?.properties.$heatmap_data).toEqual({
      "https://versemate.org/give/": [{ x: 1 }, { x: 2 }],
    });
  });

  it("scrubs URL keys in nested objects, arrays and person properties", () => {
    const out = scrubEvent({
      uuid: "u",
      event: "x",
      properties: {
        list: [{ $current_url: "https://versemate.org/?a=1" }],
        $session_entry_url: "https://versemate.org/coach/?utm_source=x",
        when: new Date(0),
      },
      $set: { $initial_referrer: "https://mail.test/?leader=l1" },
    });
    expect(out?.properties.list).toEqual([{ $current_url: "https://versemate.org/" }]);
    expect(out?.properties.$session_entry_url).toBe("https://versemate.org/coach/");
    expect(out?.properties.when).toBeInstanceOf(Date);
    expect(out?.$set).toEqual({ $initial_referrer: "https://mail.test/" });
  });
});
