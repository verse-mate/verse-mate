import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(
  import.meta.dir,
  "../../../database/migrations",
);
const FIRST_COACH = "-coach-reports-and-roster.ts";

describe("the coach migrations deploy after every migration production has run", () => {
  it("no other migration sorts in among the coach migrations", () => {
    const names = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".ts"))
      .sort();
    const first = names.findIndex((name) => name.endsWith(FIRST_COACH));
    const last =
      names.length -
      1 -
      [...names].reverse().findIndex((n) => /coach/i.test(n));

    expect(first).toBeGreaterThan(0);
    // Migrations written after the coach ones shipped sort after the last of
    // them, which production has run, so they deploy in order too.
    expect(
      names.slice(first, last + 1).filter((name) => !/coach/i.test(name)),
    ).toEqual([]);
  });
});

describe("the coach migrations fail fast instead of making sign-ins wait", () => {
  it("the first coach migration sets a 5 s lock timeout before it touches any table, and it covers the rest of the run", async () => {
    const name = readdirSync(MIGRATIONS).find((n) => n.endsWith(FIRST_COACH));
    const source = await Bun.file(path.join(MIGRATIONS, name ?? "")).text();
    const up = source.slice(source.indexOf("export async function up"));
    expect(up.split("\n")[1].trim()).toBe(
      "await sql`SET LOCAL lock_timeout = '5s'`.execute(db);",
    );
  });
});
