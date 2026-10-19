import { afterEach, describe, expect, it } from "bun:test";

import { runsApiStartup, runsWorkers, workerRole } from "./worker-role";

const ORIGINAL = process.env.VERSEMATE_ROLE;
afterEach(() => {
  if (ORIGINAL === undefined)
    Reflect.deleteProperty(process.env, "VERSEMATE_ROLE");
  else process.env.VERSEMATE_ROLE = ORIGINAL;
});

describe("a container knows which work is its job", () => {
  it("defaults to ALL, a single container runs the API and every worker", () => {
    Reflect.deleteProperty(process.env, "VERSEMATE_ROLE");
    expect(workerRole()).toBe("all");
    process.env.VERSEMATE_ROLE = "  ";
    expect(workerRole()).toBe("all");
    expect(runsWorkers("all")).toBe(true);
    expect(runsApiStartup("all")).toBe(true);
  });

  it("the API container runs no worker", () => {
    process.env.VERSEMATE_ROLE = "api";
    expect(workerRole()).toBe("api");
    expect(runsWorkers("api")).toBe(false);
    expect(runsApiStartup("api")).toBe(true);
  });

  it("the worker container runs the workers and not the API's start-up work", () => {
    process.env.VERSEMATE_ROLE = "worker";
    expect(workerRole()).toBe("worker");
    expect(runsWorkers("worker")).toBe(true);
    expect(runsApiStartup("worker")).toBe(false);
  });

  it("api and worker together run the workers and the API start-up exactly once", () => {
    expect(Number(runsWorkers("api")) + Number(runsWorkers("worker"))).toBe(1);
    expect(
      Number(runsApiStartup("api")) + Number(runsApiStartup("worker")),
    ).toBe(1);
  });

  it("an unrecognised role is refused, naming the value", () => {
    process.env.VERSEMATE_ROLE = "media-worker";
    expect(() => workerRole()).toThrow('"media-worker"');
    process.env.VERSEMATE_ROLE = "wroker";
    expect(() => workerRole()).toThrow('"wroker"');
  });

  it("case and whitespace do not change the answer", () => {
    process.env.VERSEMATE_ROLE = "  Worker  ";
    expect(workerRole()).toBe("worker");
  });
});
