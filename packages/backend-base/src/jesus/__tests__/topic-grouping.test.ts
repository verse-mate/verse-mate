import { describe, expect, it } from "bun:test";

import { JESUS_FACET_META, JESUS_FACET_TYPES } from "../jesus.constants";
import {
  type GroupableEvent,
  type GroupableTheme,
  TOPIC_POINT_LIMIT,
  groupEventsByTopic,
} from "../utils/topic-grouping.utils";

const THEMES: GroupableTheme[] = [
  {
    slug: "kingdom",
    name: "Kingdom",
    description: "The reign of God breaking into the world.",
    sort_order: 1,
  },
  {
    slug: "faith",
    name: "Faith",
    description: "Trust that acts.",
    sort_order: 2,
  },
  { slug: "money", name: "Money", description: null, sort_order: 3 },
];

let facetCounter = 0;

function facet(overrides: Partial<GroupableEvent["matched_facets"][0]> = {}) {
  facetCounter += 1;
  return {
    slug: `facet-${facetCounter}`,
    title: `Saying ${facetCounter}`,
    text: "Truly, truly, I say to you",
    summary: null,
    reference: "John 3:3",
    provenance: 1,
    ...overrides,
  };
}

function event(overrides: Partial<GroupableEvent> = {}): GroupableEvent {
  return {
    slug: "an-event",
    title: "An event",
    matched_facets: [facet()],
    passages: [{ book_name: "John" }],
    themes: [{ slug: "kingdom", name: "Kingdom" }],
    ...overrides,
  };
}

describe("groupEventsByTopic", () => {
  it("orders topics by the theme's sort order", () => {
    const groups = groupEventsByTopic(
      [
        event({ slug: "a", themes: [{ slug: "money", name: "Money" }] }),
        event({ slug: "b", themes: [{ slug: "kingdom", name: "Kingdom" }] }),
        event({ slug: "c", themes: [{ slug: "faith", name: "Faith" }] }),
      ],
      THEMES,
    );

    expect(groups.map((g) => g.slug)).toEqual(["kingdom", "faith", "money"]);
  });

  it("drops topics the category never touches", () => {
    const groups = groupEventsByTopic(
      [event({ themes: [{ slug: "faith", name: "Faith" }] })],
      THEMES,
    );

    expect(groups.map((g) => g.slug)).toEqual(["faith"]);
  });

  it("files a multi-theme event under its first theme only", () => {
    const groups = groupEventsByTopic(
      [
        event({
          slug: "born-again",
          themes: [
            { slug: "faith", name: "Faith" },
            { slug: "kingdom", name: "Kingdom" },
          ],
        }),
      ],
      THEMES,
    );

    // Counts have to sum to the category total, so the event appears once —
    // its remaining themes travel on the card for the UI to cross-link.
    expect(groups).toHaveLength(1);
    expect(groups[0].slug).toBe("faith");
    expect(groups[0].event_count).toBe(1);
  });

  it("ignores themes the taxonomy no longer has", () => {
    const groups = groupEventsByTopic(
      [
        event({
          themes: [
            { slug: "retired-theme", name: "Retired" },
            { slug: "kingdom", name: "Kingdom" },
          ],
        }),
      ],
      THEMES,
    );

    expect(groups.map((g) => g.slug)).toEqual(["kingdom"]);
  });

  it("collects untagged events into a trailing catch-all", () => {
    const groups = groupEventsByTopic(
      [
        event({ slug: "a", themes: [] }),
        event({ slug: "b", themes: [{ slug: "kingdom", name: "Kingdom" }] }),
      ],
      THEMES,
    );

    expect(groups.map((g) => g.slug)).toEqual(["kingdom", null]);
    expect(groups[1].name).toBe("Other");
    expect(groups[1].event_count).toBe(1);
  });

  it("keeps every event exactly once across the groups", () => {
    const events = [
      event({ slug: "a", themes: [{ slug: "kingdom", name: "Kingdom" }] }),
      event({
        slug: "b",
        themes: [
          { slug: "kingdom", name: "Kingdom" },
          { slug: "faith", name: "Faith" },
        ],
      }),
      event({ slug: "c", themes: [] }),
    ];

    const groups = groupEventsByTopic(events, THEMES);
    const slugs = groups.flatMap((g) => g.events.map((e) => e.slug));

    expect(slugs.sort()).toEqual(["a", "b", "c"]);
    expect(groups.reduce((sum, g) => sum + g.event_count, 0)).toBe(3);
  });

  it("preserves the incoming (chronological) order inside a topic", () => {
    const groups = groupEventsByTopic(
      [
        event({ slug: "first" }),
        event({ slug: "second" }),
        event({ slug: "third" }),
      ],
      THEMES,
    );

    expect(groups[0].events.map((e) => e.slug)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("dedupes points by title so parallel accounts appear once", () => {
    const groups = groupEventsByTopic(
      [
        event({
          slug: "a",
          matched_facets: [facet({ title: "The Sabbath was made for man" })],
        }),
        event({
          slug: "b",
          matched_facets: [facet({ title: "the sabbath was made for man " })],
        }),
      ],
      THEMES,
    );

    expect(groups[0].points).toHaveLength(1);
    expect(groups[0].facet_count).toBe(2);
  });

  it("leads with facets that carry His words", () => {
    const groups = groupEventsByTopic(
      [
        event({
          matched_facets: [
            facet({ title: "Paraphrased only", text: null }),
            facet({ title: "In His own words", text: "I am the door" }),
          ],
        }),
      ],
      THEMES,
    );

    expect(groups[0].points.map((p) => p.title)).toEqual([
      "In His own words",
      "Paraphrased only",
    ]);
  });

  it("caps the points shown per topic", () => {
    const groups = groupEventsByTopic(
      [
        event({
          matched_facets: Array.from({ length: TOPIC_POINT_LIMIT + 4 }, () =>
            facet(),
          ),
        }),
      ],
      THEMES,
    );

    expect(groups[0].points).toHaveLength(TOPIC_POINT_LIMIT);
    expect(groups[0].facet_count).toBe(TOPIC_POINT_LIMIT + 4);
  });

  it("lists a topic's gospels in canonical order, without repeats", () => {
    const groups = groupEventsByTopic(
      [
        event({
          slug: "a",
          passages: [{ book_name: "Luke" }, { book_name: "Matthew" }],
        }),
        event({
          slug: "b",
          passages: [{ book_name: "Matthew" }, { book_name: "Mark" }],
        }),
      ],
      THEMES,
    );

    expect(groups[0].gospels).toEqual(["Matthew", "Mark", "Luke"]);
  });

  it("returns nothing for an empty category", () => {
    expect(groupEventsByTopic([], THEMES)).toEqual([]);
  });
});

describe("category intros", () => {
  it("gives every browsable category an intro of its own", () => {
    const intros = new Set<string>();
    for (const type of JESUS_FACET_TYPES) {
      const { intro } = JESUS_FACET_META[type];
      expect(intro.length).toBeGreaterThan(40);
      intros.add(intro);
    }
    // Every tab gets the topic-led treatment, so no two may share copy.
    expect(intros.size).toBe(JESUS_FACET_TYPES.length);
  });
});
