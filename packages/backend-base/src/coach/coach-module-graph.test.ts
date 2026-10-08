import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const IMPORT = /^import\s+(?!type\b)([\s\S]*?)\s+from\s+"\.\/([^"]+)";/gm;

function runtimeImports(file: string): string[] {
  const source = readFileSync(join(DIR, file), "utf8");
  return [...source.matchAll(IMPORT)]
    .filter(([, clause]) =>
      /\w/.test(clause.replace(/\btype\s+\w+/g, "").replace(/[{},\s]/g, "")),
    )
    .map(([, , target]) => `${target}.ts`);
}

const modules = readdirSync(DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);
const graph = new Map(modules.map((m) => [m, runtimeImports(m)]));

function cycleFrom(start: string): string[] | null {
  const walk = (node: string, path: string[]): string[] | null => {
    for (const next of graph.get(node) ?? []) {
      if (next === start) return [...path, next];
      if (path.includes(next)) continue;
      const found = walk(next, [...path, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(start, [start]);
}

describe("the coach modules load without a cycle", () => {
  it("no coach module reaches itself through its runtime imports", () => {
    const cycles = modules
      .map(cycleFrom)
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join(" -> "));
    expect(cycles).toEqual([]);
  });

  it("the admin service reaches delivery directly and never loads the scoring pipeline", () => {
    const source = readFileSync(join(DIR, "coach.service.ts"), "utf8");
    expect(source).not.toContain('import("./coach-delivery.service")');
    expect(source).not.toContain('import("./coach-pipeline.service")');
    expect(runtimeImports("coach.service.ts")).toContain(
      "coach-delivery.service.ts",
    );
  });

  it("the stored-evidence reader lives beside the evidence it reads", async () => {
    const governance = await import("./coach-governance.service");
    expect(typeof governance.storedEvidence).toBe("function");
  });

  it("amending a report does not load the scoring pipeline", () => {
    expect(runtimeImports("coach-amend.service.ts")).not.toContain(
      "coach-pipeline.service.ts",
    );
  });
});
