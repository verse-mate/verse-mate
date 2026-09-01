import { describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();
const PROBE = "attrib-probe@example.test";

async function cleanup() {
  await conn.deleteFrom("coach_leaders").where("email", "=", PROBE).execute();
}

describe("intake attribution config is data, not a file on a host", () => {
  it("a leader carries title-match keywords and alternate sender addresses", async () => {
    await cleanup();
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "attrib-probe",
        email: PROBE,
        name: "Probe",
        title_match: ["thursday evening", "austin stone"],
        alt_emails: ["probe.alt@example.test"],
      })
      .execute();

    const row = await conn
      .selectFrom("coach_leaders")
      .select(["title_match", "alt_emails"])
      .where("email", "=", PROBE)
      .executeTakeFirstOrThrow();
    expect(row.title_match).toEqual(["thursday evening", "austin stone"]);
    expect(row.alt_emails).toEqual(["probe.alt@example.test"]);
    await cleanup();
  });

  it("both default to empty, so a leader with no keywords is still a valid row", async () => {
    await cleanup();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "attrib-probe", email: PROBE, name: "Probe" })
      .execute();
    const row = await conn
      .selectFrom("coach_leaders")
      .select(["title_match", "alt_emails"])
      .where("email", "=", PROBE)
      .executeTakeFirstOrThrow();
    expect(row.title_match).toEqual([]);
    expect(row.alt_emails).toEqual([]);
    await cleanup();
  });

  it("changing a keyword is an UPDATE, not a deploy (open question 6, decided)", async () => {
    await cleanup();
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "attrib-probe",
        email: PROBE,
        name: "Probe",
        title_match: ["old keyword"],
      })
      .execute();
    await sql`
      UPDATE coach_leaders SET title_match = ARRAY['new keyword']
      WHERE email = ${PROBE}
    `.execute(conn);
    const row = await conn
      .selectFrom("coach_leaders")
      .select("title_match")
      .where("email", "=", PROBE)
      .executeTakeFirstOrThrow();
    expect(row.title_match).toEqual(["new keyword"]);
    await cleanup();
  });
});
