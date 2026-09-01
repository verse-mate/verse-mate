import { describe, expect, it } from "bun:test";

import { type AttributionLeader, attributeSession } from "./coach-attribution";

const BRYAN: AttributionLeader = {
  slug: "bryan-bailey",
  name: "Bryan Bailey",
  email: "bryan@example.test",
  titleMatch: ["austin ridge", "saturday morning"],
  altEmails: ["bryan.alt@example.test"],
};
const JOEL: AttributionLeader = {
  slug: "joel-hurt",
  name: "Joel Hurt",
  email: "joel@example.test",
  titleMatch: ["thursday evening"],
  altEmails: [],
};
const ROSTER = [BRYAN, JOEL];

function session(over: Partial<Parameters<typeof attributeSession>[0]> = {}) {
  return {
    title: "",
    host_email: "fred@fireflies.ai",
    organizer_email: "fred@fireflies.ai",
    ...over,
  };
}

describe("a session is attributed by its title, not its sender", () => {
  it("a configured keyword wins", () => {
    expect(
      attributeSession(
        session({ title: "Obadiah — Austin Ridge group" }),
        ROSTER,
      ),
    ).toEqual({ coachId: "bryan-bailey", matchedBy: "title_match" });
  });

  it("the leader's own name resolves without any keyword configured", () => {
    expect(
      attributeSession(session({ title: "Study with Joel Hurt" }), ROSTER),
    ).toEqual({ coachId: "joel-hurt", matchedBy: "name" });
  });

  it("the MORE SPECIFIC keyword wins when two match", () => {
    // "saturday morning" must beat a shorter competing keyword, or the specific
    // one can never win and a leader is misrouted.
    const ambiguous: AttributionLeader = {
      slug: "someone-else",
      name: "Someone Else",
      email: "se@example.test",
      titleMatch: ["saturday"],
      altEmails: [],
    };
    expect(
      attributeSession(session({ title: "Saturday Morning study" }), [
        ambiguous,
        BRYAN,
      ]),
    ).toEqual({ coachId: "bryan-bailey", matchedBy: "title_match" });
  });

  it("an alternate sender address resolves a leader the title does not name", () => {
    expect(
      attributeSession(
        session({
          title: "Weekly group",
          host_email: "bryan.alt@example.test",
        }),
        ROSTER,
      ),
    ).toEqual({ coachId: "bryan-bailey", matchedBy: "alt_email" });
  });

  it("the SHARED bot host address attributes to nobody", () => {
    // Every leader's meeting is filed under it; matching on it would route the
    // whole programme to one leader.
    expect(
      attributeSession(session({ title: "Weekly group" }), ROSTER).coachId,
    ).toBeNull();
  });

  it("an unattributable session is flagged, not dropped", () => {
    const result = attributeSession(
      session({ title: "Board meeting" }),
      ROSTER,
    );
    expect(result).toEqual({ coachId: null, matchedBy: "unresolved" });
  });

  it("matching is case-insensitive in both directions", () => {
    expect(
      attributeSession(session({ title: "AUSTIN RIDGE" }), ROSTER).coachId,
    ).toBe("bryan-bailey");
    expect(
      attributeSession(
        session({ title: "x", host_email: "BRYAN.ALT@EXAMPLE.TEST" }),
        ROSTER,
      ).coachId,
    ).toBe("bryan-bailey");
  });

  it("an empty keyword never matches everything", () => {
    const sloppy: AttributionLeader = { ...JOEL, titleMatch: [""] };
    expect(
      attributeSession(session({ title: "Board meeting" }), [sloppy]).coachId,
    ).toBeNull();
  });
});
