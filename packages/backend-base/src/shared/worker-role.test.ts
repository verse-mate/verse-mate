import { afterEach, describe, expect, it } from "bun:test";

import { runsApiWorkers, runsMediaWorkers, workerRole } from "./worker-role";

const ORIGINAL = process.env.VERSEMATE_ROLE;
afterEach(() => {
  if (ORIGINAL === undefined)
    Reflect.deleteProperty(process.env, "VERSEMATE_ROLE");
  else process.env.VERSEMATE_ROLE = ORIGINAL;
});

describe("a container knows which workers are its job", () => {
  it("defaults to ALL — today's single-container deployment is unchanged", () => {
    // A default of 'api' would have silently stopped media work on the existing
    // deployment the moment this shipped.
    Reflect.deleteProperty(process.env, "VERSEMATE_ROLE");
    expect(workerRole()).toBe("all");
    expect(runsApiWorkers()).toBe(true);
    expect(runsMediaWorkers()).toBe(true);
  });

  it("the API container runs no media workers", () => {
    process.env.VERSEMATE_ROLE = "api";
    expect(runsApiWorkers()).toBe(true);
    expect(runsMediaWorkers()).toBe(false);
  });

  it("the media container runs ONLY media workers", () => {
    process.env.VERSEMATE_ROLE = "media-worker";
    expect(runsMediaWorkers()).toBe(true);
    expect(runsApiWorkers()).toBe(false);
  });

  it("the two roles together cover every worker exactly once", () => {
    // The property that matters: split across two containers, each worker runs
    // in exactly one — no job processed twice, none dropped.
    process.env.VERSEMATE_ROLE = "api";
    const api = { media: runsMediaWorkers(), apiSide: runsApiWorkers() };
    process.env.VERSEMATE_ROLE = "media-worker";
    const media = { media: runsMediaWorkers(), apiSide: runsApiWorkers() };
    expect(Number(api.media) + Number(media.media)).toBe(1);
    expect(Number(api.apiSide) + Number(media.apiSide)).toBe(1);
  });

  it("an unrecognised role falls back to ALL rather than running nothing", () => {
    process.env.VERSEMATE_ROLE = "meida-worker";
    expect(workerRole()).toBe("all");
    expect(runsMediaWorkers()).toBe(true);
    expect(runsApiWorkers()).toBe(true);
  });

  it("case and whitespace do not change the answer", () => {
    process.env.VERSEMATE_ROLE = "  Media-Worker  ";
    expect(workerRole()).toBe("media-worker");
  });
});
