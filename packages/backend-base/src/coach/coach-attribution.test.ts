import { describe, expect, it } from "bun:test";

import { type AttributionLeader, attributeSession } from "./coach-attribution";

const AVERY: AttributionLeader = {
  slug: "avery-hollis",
  name: "Avery Hollis",
  email: "avery@example.test",
  titleMatch: ["cedar hollow", "saturday morning"],
  altEmails: ["avery.alt@example.test"],
};
const EZRA: AttributionLeader = {
  slug: "ezra-holt",
  name: "Ezra Holt",
  email: "joel@example.test",
  titleMatch: ["thursday evening"],
  altEmails: [],
};
const ROSTER = [AVERY, EZRA];

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
        session({ title: "Obadiah — Cedar Hollow group" }),
        ROSTER,
      ),
    ).toEqual({ coachId: "avery-hollis", matchedBy: "title_match" });
  });

  it("the leader's own name resolves without any keyword configured", () => {
    expect(
      attributeSession(session({ title: "Study with Ezra Holt" }), ROSTER),
    ).toEqual({ coachId: "ezra-holt", matchedBy: "name" });
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
        AVERY,
      ]),
    ).toEqual({ coachId: "avery-hollis", matchedBy: "title_match" });
  });

  it("an alternate sender address resolves a leader the title does not name", () => {
    expect(
      attributeSession(
        session({
          title: "Weekly group",
          host_email: "avery.alt@example.test",
        }),
        ROSTER,
      ),
    ).toEqual({ coachId: "avery-hollis", matchedBy: "alt_email" });
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
      attributeSession(session({ title: "CEDAR HOLLOW" }), ROSTER).coachId,
    ).toBe("avery-hollis");
    expect(
      attributeSession(
        session({ title: "x", host_email: "AVERY.ALT@EXAMPLE.TEST" }),
        ROSTER,
      ).coachId,
    ).toBe("avery-hollis");
  });

  it("an empty keyword never matches everything", () => {
    const sloppy: AttributionLeader = { ...EZRA, titleMatch: [""] };
    expect(
      attributeSession(session({ title: "Board meeting" }), [sloppy]).coachId,
    ).toBeNull();
  });
});

describe("a session two leaders could claim is unresolved", () => {
  const ROW: AttributionLeader = {
    slug: "rowan-ashby",
    name: "Rowan Ashby",
    email: "rowan@example.test",
    titleMatch: ["bible study"],
    altEmails: ["rowan.home@example.test"],
  };
  const MAE: AttributionLeader = {
    slug: "mae-corrin",
    name: "Mae Corrin",
    email: "mae@example.test",
    titleMatch: [],
    altEmails: ["mae.home@example.test"],
  };

  it("one leader's keyword and another leader's name in the same title", () => {
    expect(
      attributeSession(session({ title: "Bible study with Mae Corrin" }), [
        ROW,
        MAE,
      ]),
    ).toEqual({ coachId: null, matchedBy: "unresolved" });
  });

  it("one leader's keyword and another leader's sender address", () => {
    expect(
      attributeSession(
        session({ title: "Bible study", host_email: "mae.home@example.test" }),
        [ROW, MAE],
      ),
    ).toEqual({ coachId: null, matchedBy: "unresolved" });
  });

  it("one leader's name and another leader's sender address", () => {
    expect(
      attributeSession(
        session({
          title: "Study with Rowan Ashby",
          organizer_email: "mae.home@example.test",
        }),
        [ROW, MAE],
      ),
    ).toEqual({ coachId: null, matchedBy: "unresolved" });
  });

  it("every step pointing at the same leader still resolves by the first", () => {
    expect(
      attributeSession(
        session({
          title: "Bible study with Rowan Ashby",
          host_email: "rowan.home@example.test",
        }),
        [ROW, MAE],
      ),
    ).toEqual({ coachId: "rowan-ashby", matchedBy: "title_match" });
  });
});

describe("keywords and names match whole words of the title", () => {
  const TIM: AttributionLeader = {
    slug: "tim-keller",
    name: "Tim Keller",
    email: "tim@example.test",
    titleMatch: ["tim"],
    altEmails: [],
  };

  it("a keyword does not match inside a longer word", () => {
    expect(
      attributeSession(session({ title: "Quiet time in Obadiah" }), [TIM]),
    ).toEqual({ coachId: null, matchedBy: "unresolved" });
  });

  it("a keyword matches as a word, whatever punctuation surrounds it", () => {
    expect(
      attributeSession(session({ title: "Tim's group: Obadiah" }), [TIM]),
    ).toEqual({ coachId: "tim-keller", matchedBy: "title_match" });
  });

  it("a name does not match a longer name it is the start of", () => {
    expect(
      attributeSession(session({ title: "Study with Ezra Holtman" }), ROSTER),
    ).toEqual({ coachId: null, matchedBy: "unresolved" });
  });
});
