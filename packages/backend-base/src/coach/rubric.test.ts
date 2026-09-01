import { describe, expect, it } from "bun:test";

import {
  CLUSTERS,
  DIMENSIONS,
  RUBRIC_MODEL_VERSION,
  STATUS_BANDS,
  clusterPercentages,
  composeBaseScore,
  dimensionBandLabel,
  rubricContract,
  statusForScore,
} from "./rubric";

describe("the rubric is defined exactly once", () => {
  it("carries the four weighted clusters, summing to 100", () => {
    expect(CLUSTERS.map((c) => c.name)).toEqual([
      "Teaching Craft",
      "Building Ministry",
      "Engaging People",
      "Being Real",
    ]);
    expect(CLUSTERS.map((c) => c.weight)).toEqual([33, 31, 18, 18]);
    expect(CLUSTERS.reduce((n, c) => n + c.weight, 0)).toBe(100);
  });

  it("maps all twelve dimensions onto a cluster that exists, with an explainer and a target", () => {
    expect(DIMENSIONS.length).toBe(12);
    expect(DIMENSIONS.map((d) => d.n)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    const clusterNames = new Set(CLUSTERS.map((c) => c.name));
    for (const d of DIMENSIONS) {
      expect(clusterNames.has(d.cluster)).toBe(true);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.what.length).toBeGreaterThan(0);
      expect(d.target.length).toBeGreaterThan(0);
    }
  });

  it("a cluster weight is read, never restated — the contract quotes the definition", () => {
    // The single-source property, made falsifiable: the served contract is
    // derived from CLUSTERS/DIMENSIONS, so a second hand-maintained copy would
    // drift and this comparison would catch it.
    const contract = rubricContract();
    expect(contract.clusters).toEqual(CLUSTERS.map((c) => ({ ...c })));
    expect(contract.statusBands).toEqual(STATUS_BANDS.map((b) => ({ ...b })));
    expect(contract.model).toBe(RUBRIC_MODEL_VERSION);
    expect(contract.dimensions.map((d) => [d.n, d.cluster])).toEqual(
      DIMENSIONS.map((d) => [d.n, d.cluster]),
    );
    for (const d of contract.dimensions) {
      const cluster = contract.clusters.find((c) => c.name === d.cluster);
      expect(cluster).toBeDefined();
      expect(d.clusterWeight).toBe(cluster?.weight as number);
    }
  });

  it("serves the 1-5 band labels, so the portal does not keep its own list", () => {
    expect(dimensionBandLabel(5)).toBe("Exemplary");
    expect(dimensionBandLabel(4)).toBe("Strong");
    expect(dimensionBandLabel(3)).toBe("On target");
    expect(dimensionBandLabel(2)).toBe("Developing");
    expect(dimensionBandLabel(1)).toBe("Early stage");
    expect(dimensionBandLabel(null)).toBe("Not applicable this session");
  });

  it("serves the composite status bands", () => {
    expect(statusForScore(90).label).toBe("Exceptional");
    expect(statusForScore(78.1).label).toBe("Strong");
    expect(statusForScore(65).label).toBe("On Target");
    expect(statusForScore(50).label).toBe("Developing");
    expect(statusForScore(10).label).toBe("Early Stage");
  });
});

describe("the composite is computed from that definition", () => {
  /** Scores that produce the spec's worked composition. */
  function scoresFor(pcts: Record<string, number>): Map<number, number | null> {
    const out = new Map<number, number | null>();
    for (const cluster of CLUSTERS) {
      const dims = DIMENSIONS.filter((d) => d.cluster === cluster.name);
      // Distribute the target percentage across the cluster's dimensions.
      const total = ((pcts[cluster.name] ?? 0) / 100) * 5 * dims.length;
      let left = total;
      dims.forEach((d, i) => {
        const v =
          i === dims.length - 1 ? left : Math.round(left / (dims.length - i));
        out.set(d.n, v);
        left -= v;
      });
    }
    return out;
  }

  it("reproduces the spec's worked composition (78.1 = 22.4 + 26.9 + 14.4 + 14.4)", () => {
    // Stated as cluster percentages, exactly as the requirement words it.
    const pct = new Map([
      ["Teaching Craft", 68],
      ["Building Ministry", 86.7],
      ["Engaging People", 80],
      ["Being Real", 80],
    ]);
    const contributions = CLUSTERS.map((c) => ({
      name: c.name,
      contribution: ((pct.get(c.name) as number) / 100) * c.weight,
    }));
    expect(contributions.map((c) => Number(c.contribution.toFixed(1)))).toEqual(
      [22.4, 26.9, 14.4, 14.4],
    );
    const base = contributions.reduce((n, c) => n + c.contribution, 0);
    expect(Number(base.toFixed(1))).toBe(78.1);

    // …and the module computes the same thing from raw dimension scores.
    const scores = scoresFor({
      "Teaching Craft": 68,
      "Building Ministry": 86.7,
      "Engaging People": 80,
      "Being Real": 80,
    });
    const computed = composeBaseScore(scores);
    expect(Number(computed.base.toFixed(1))).toBe(78.1);
  });

  it("a cluster percentage is the sum of its scores over five times the count scored", () => {
    // Teaching Craft has five dimensions; all at 4/5 is 80%.
    const scores = new Map<number, number | null>();
    for (const d of DIMENSIONS)
      scores.set(d.n, d.cluster === "Teaching Craft" ? 4 : 5);
    const pct = clusterPercentages(scores);
    expect(pct.get("Teaching Craft")).toBeCloseTo(80, 6);
    expect(pct.get("Being Real")).toBeCloseTo(100, 6);
  });

  it("a not-applicable dimension leaves its cluster able to reach the FULL weight", () => {
    // Newcomer Welcome (2) not applicable: Building Ministry is scored over its
    // two remaining dimensions, and full marks on both earn all 31 points.
    const scores = new Map<number, number | null>();
    for (const d of DIMENSIONS)
      scores.set(d.n, d.cluster === "Building Ministry" ? 5 : 0);
    scores.set(2, null);
    const { clusters } = composeBaseScore(scores);
    const bm = clusters.find((c) => c.name === "Building Ministry");
    expect(bm?.scorePct).toBeCloseTo(100, 6);
    expect(bm?.contribution).toBeCloseTo(31, 6);
  });

  it("a cluster with NOTHING scored contributes nothing and does not divide by zero", () => {
    const scores = new Map<number, number | null>();
    for (const d of DIMENSIONS)
      scores.set(d.n, d.cluster === "Being Real" ? null : 5);
    const { clusters, base } = composeBaseScore(scores);
    const br = clusters.find((c) => c.name === "Being Real");
    expect(br?.scorePct).toBeNull();
    expect(br?.contribution).toBe(0);
    expect(Number.isFinite(base)).toBe(true);
  });

  it("changing a weight moves the composite with no second edit", () => {
    // The 3.7 acceptance, made executable: compose reads CLUSTERS, so a weight
    // change cannot be half-applied.
    const scores = new Map<number, number | null>();
    for (const d of DIMENSIONS) scores.set(d.n, 5);
    const { base, clusters } = composeBaseScore(scores);
    expect(base).toBeCloseTo(100, 6);
    for (const c of clusters) {
      const defined = CLUSTERS.find((x) => x.name === c.name);
      expect(c.contribution).toBeCloseTo(defined?.weight as number, 6);
    }
  });
});
