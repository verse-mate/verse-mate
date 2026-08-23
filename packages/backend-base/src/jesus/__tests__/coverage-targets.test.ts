import { describe, expect, it } from "bun:test";

import { JESUS_ENTRIES } from "database/src/seeds/data/jesus.data";

import {
  JESUS_CATEGORY_TARGETS,
  JESUS_FACET_TYPES,
  type JesusFacetType,
  MIRACLE_CATALOGUE_TARGET,
  MIRACLE_CATALOGUE_TYPES,
  assessCoverage,
  fillGoal,
  typesUnderTarget,
} from "../jesus.constants";
import {
  DEFAULT_PER_EVENT_TYPE_CAP,
  type KeepTally,
  selectFacetsToWrite,
} from "../utils/persist-extracted-facets";

const emptyTally = (): KeepTally => ({
  proposed: 0,
  written: 0,
  noText: 0,
  duplicate: 0,
  filtered: 0,
  capped: 0,
});

describe("coverage targets", () => {
  it("only targets types the taxonomy has", () => {
    for (const type of Object.keys(JESUS_CATEGORY_TARGETS)) {
      expect(JESUS_FACET_TYPES).toContain(type as JesusFacetType);
    }
  });

  it("states a range, never a point", () => {
    for (const [type, target] of Object.entries(JESUS_CATEGORY_TARGETS)) {
      // A single number would say the catalogues agree, and they do not.
      expect({ type, ordered: target.min <= target.max }).toEqual({
        type,
        ordered: true,
      });
      expect(target.min).toBeGreaterThan(0);
    }
  });

  it("reports under, ok and over against a range", () => {
    const rows = assessCoverage({ COMPASSION: 3, PARABLE: 38, PRAYER: 400 });
    const by = (t: string) => rows.find((r) => r.type === t);

    expect(by("COMPASSION")?.status).toBe("under");
    expect(by("COMPASSION")?.delta).toBe(12); // 15 - 3
    expect(by("PARABLE")?.status).toBe("ok");
    expect(by("PARABLE")?.delta).toBe(0);
    expect(by("PRAYER")?.status).toBe("over");
    expect(by("PRAYER")?.delta).toBe(375); // 400 - 25
  });

  it("does not report a count that only just misses the band", () => {
    // The bands are approximate. Flagging 34 parables against 35-40 would
    // claim the published catalogues agree to the unit, and they do not.
    const by = (counts: Parameters<typeof assessCoverage>[0], t: string) =>
      assessCoverage(counts).find((r) => r.type === t)?.status;

    expect(by({ PARABLE: 34 }, "PARABLE")).toBe("ok");
    expect(by({ PARABLE: 44 }, "PARABLE")).toBe("ok");
    expect(by({ COMPASSION: 13 }, "COMPASSION")).toBe("ok");
    expect(by({ COMPASSION: 23 }, "COMPASSION")).toBe("ok");

    // Clearly out still reports.
    expect(by({ PARABLE: 10 }, "PARABLE")).toBe("under");
    expect(by({ PARABLE: 90 }, "PARABLE")).toBe("over");
  });

  it("aims a fill run at the middle of the band, not its floor", () => {
    // Aiming at `min` lands every category at the thin end of an approximate
    // range and makes the exact boundary matter.
    expect(fillGoal({ min: 15, max: 20 })).toBe(18);
    expect(fillGoal({ min: 50, max: 60 })).toBe(55);

    const row = assessCoverage({ COMPASSION: 0 }).find(
      (r) => r.type === "COMPASSION",
    );
    expect(row?.goal).toBe(18);
  });

  it("marks a type with no published range untargeted, not under", () => {
    const row = assessCoverage({}).find((r) => r.type === "SYMBOLIC_ACTION");
    expect(row?.status).toBe("untargeted");
    expect(row?.delta).toBe(0);
  });

  it("orders the types needing filling by how short they are", () => {
    const order = typesUnderTarget({ QUESTION: 27, COMPASSION: 4 });
    // Questions are ~273 short, compassion ~11 — the big gap goes first.
    expect(order[0]).toBe("QUESTION");
    expect(order).toContain("COMPASSION");
  });

  it("leaves a type just short of its band off the fill list", () => {
    // 14 against a band of 15-20 is within tolerance, so a run does not go
    // chasing one more act of compassion.
    expect(typesUnderTarget({ COMPASSION: 14 })).not.toContain("COMPASSION");
  });

  it("leaves a type out of the fill list once it is in range", () => {
    expect(typesUnderTarget({ PARABLE: 38 })).not.toContain("PARABLE");
  });

  it("keeps the categories the seed corpus can reach off the short list", () => {
    // Asserted as "not clearly short" rather than "in the band". The bands are
    // approximate, so pinning a hand-authored category to one would fail CI
    // for adding a 21st act of compassion — which is the opposite of the
    // incentive wanted here. The rest of the categories need extraction and
    // are expected to be short until it runs.
    const counts: Partial<Record<JesusFacetType, number>> = {};
    for (const e of JESUS_ENTRIES) {
      const t = e.kind as JesusFacetType;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const short = new Set(typesUnderTarget(counts));

    expect(short.has("COMPASSION")).toBe(false);
    expect(short.has("CONFRONTATION")).toBe(false);
    expect(short.has("PARABLE")).toBe(false);
    expect(short.has("MIRACLE")).toBe(false);
    expect(short.has("HEALING")).toBe(false);
  });

  it("covers the traditional miracle catalogue, give or take", () => {
    const counts: Partial<Record<JesusFacetType, number>> = {};
    for (const e of JESUS_ENTRIES) {
      const t = e.kind as JesusFacetType;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const catalogue = MIRACLE_CATALOGUE_TYPES.reduce(
      (sum, t) => sum + (counts[t] ?? 0),
      0,
    );
    // ~37 is the usual published catalogue and no number is derivable from
    // Scripture, so this guards against the category being gutted, not against
    // it growing.
    expect(catalogue).toBeGreaterThanOrEqual(
      Math.round(MIRACLE_CATALOGUE_TARGET.min * 0.9),
    );
  });
});

describe("per-event facet cap", () => {
  const facets = (type: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      type,
      mode: "WORD" as const,
      title: `w${i}`,
      text: `saying number ${i}`,
    }));

  it("stops one event from filling a category by itself", () => {
    const tally = emptyTally();
    const kept = selectFacetsToWrite({
      facets: facets("WARNING", 40) as never,
      existingKeys: new Set(),
      wantedTypes: null,
      eventSlug: "olivet-discourse",
      usedSlugs: new Set(),
      tally,
    });

    expect(kept.length).toBe(DEFAULT_PER_EVENT_TYPE_CAP);
    expect(tally.capped).toBe(40 - DEFAULT_PER_EVENT_TYPE_CAP);
  });

  it("counts what the event already carries toward the cap", () => {
    // Otherwise a second run stacks another cap's worth on the first.
    const tally = emptyTally();
    const kept = selectFacetsToWrite({
      facets: facets("WARNING", 10) as never,
      existingKeys: new Set(),
      wantedTypes: null,
      eventSlug: "olivet-discourse",
      usedSlugs: new Set(),
      tally,
      existingTypeCounts: { WARNING: DEFAULT_PER_EVENT_TYPE_CAP },
    });

    expect(kept).toEqual([]);
    expect(tally.written).toBe(0);
  });

  it("caps each type separately", () => {
    const tally = emptyTally();
    const kept = selectFacetsToWrite({
      facets: [...facets("WARNING", 10), ...facets("CLAIM", 10)] as never,
      existingKeys: new Set(),
      wantedTypes: null,
      eventSlug: "an-event",
      usedSlugs: new Set(),
      tally,
      perEventTypeCap: 2,
    });

    expect(kept.filter((f) => f.type === "WARNING").length).toBe(2);
    expect(kept.filter((f) => f.type === "CLAIM").length).toBe(2);
  });

  it("can be disabled outright", () => {
    const tally = emptyTally();
    const kept = selectFacetsToWrite({
      facets: facets("WARNING", 12) as never,
      existingKeys: new Set(),
      wantedTypes: null,
      eventSlug: "an-event",
      usedSlugs: new Set(),
      tally,
      perEventTypeCap: Number.POSITIVE_INFINITY,
    });

    expect(kept.length).toBe(12);
    expect(tally.capped).toBe(0);
  });

  it("still drops a saying with no words before it reaches the cap", () => {
    const tally = emptyTally();
    const kept = selectFacetsToWrite({
      facets: [
        { type: "PRAYER", mode: "WORD", title: "Falls on His face" },
      ] as never,
      existingKeys: new Set(),
      wantedTypes: null,
      eventSlug: "gethsemane",
      usedSlugs: new Set(),
      tally,
    });

    expect(kept).toEqual([]);
    expect(tally.noText).toBe(1);
    expect(tally.capped).toBe(0);
  });
});
