import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import coachPlugin from "./coach.plugin";
import { CLUSTERS, DIMENSIONS, STATUS_BANDS } from "./rubric";

const app = new Elysia().use(coachPlugin);

describe("GET /coach/rubric serves the whole contract", () => {
  it("is readable without a coaching session, the explainer is not private", async () => {
    const res = await app.handle(new Request("http://localhost/coach/rubric"));
    expect(res.status).toBe(200);
  });

  it("serves cluster names and weights straight from the definition", async () => {
    const res = await app.handle(new Request("http://localhost/coach/rubric"));
    const body = (await res.json()) as {
      clusters: Array<{ name: string; weight: number }>;
    };
    expect(body.clusters).toEqual(CLUSTERS.map((c) => ({ ...c })));
  });

  it("serves the dimension mapping WITH each explainer and target", async () => {
    // The portal deletes dimensionInfo.ts (task 8.2); without these fields the
    // explainer UI cannot survive the deletion.
    const res = await app.handle(new Request("http://localhost/coach/rubric"));
    const body = (await res.json()) as {
      dimensions: Array<{
        n: number;
        name: string;
        cluster: string;
        clusterWeight: number;
        what: string;
        target: string;
      }>;
    };
    expect(body.dimensions.length).toBe(12);
    for (const served of body.dimensions) {
      const defined = DIMENSIONS.find((d) => d.n === served.n);
      expect(served.name).toBe(defined?.name as string);
      expect(served.cluster).toBe(defined?.cluster as string);
      expect(served.what).toBe(defined?.what as string);
      expect(served.target).toBe(defined?.target as string);
      const cluster = CLUSTERS.find((c) => c.name === served.cluster);
      expect(served.clusterWeight).toBe(cluster?.weight as number);
    }
  });

  it("serves both band scales, composite status and the 1-5 dimension labels", async () => {
    const res = await app.handle(new Request("http://localhost/coach/rubric"));
    const body = (await res.json()) as {
      statusBands: Array<{ min: number; label: string; emoji: string }>;
      dimensionBands: Array<{ min: number; label: string }>;
      model: string;
    };
    expect(body.statusBands).toEqual(STATUS_BANDS.map((b) => ({ ...b })));
    expect(body.dimensionBands.map((b) => b.label)).toEqual([
      "Exemplary",
      "Strong",
      "On target",
      "Developing",
      "Early stage",
    ]);
    expect(body.model).toBe("v3-weighted-100");
  });
});
