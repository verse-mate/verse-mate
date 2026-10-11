import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(
  import.meta.dir,
  "../../../database/migrations",
);
const FIRST_COACH = "-coach-reports-and-roster.ts";

describe("the coach migrations deploy after every migration production has run", () => {
  it("no other migration sorts after the first coach migration", () => {
    const names = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".ts"))
      .sort();
    const first = names.findIndex((name) => name.endsWith(FIRST_COACH));

    expect(first).toBeGreaterThan(0);
    expect(names.slice(first).filter((name) => !/coach/i.test(name))).toEqual(
      [],
    );
  });
});
