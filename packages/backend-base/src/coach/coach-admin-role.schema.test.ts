import { describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

const conn = Database.getOrCreateConnection();

const PROBE = "admin-probe@example.test";

async function cleanup() {
  await conn.deleteFrom("coach_admins").where("email", "=", PROBE).execute();
}

describe("the program-admin role is data, not a deploy", () => {
  it("an admin is granted and revoked with no code change", async () => {
    await cleanup();
    expect(
      await conn
        .selectFrom("coach_admins")
        .select("email")
        .where("email", "=", PROBE)
        .executeTakeFirst(),
    ).toBeUndefined();

    await conn
      .insertInto("coach_admins")
      .values({ email: PROBE, granted_by: null })
      .execute();
    const granted = await conn
      .selectFrom("coach_admins")
      .selectAll()
      .where("email", "=", PROBE)
      .executeTakeFirstOrThrow();
    expect(granted.email).toBe(PROBE);
    expect(granted.granted_at).toBeTruthy();

    await conn.deleteFrom("coach_admins").where("email", "=", PROBE).execute();
    expect(
      await conn
        .selectFrom("coach_admins")
        .select("email")
        .where("email", "=", PROBE)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it("the same address cannot be granted twice", async () => {
    await cleanup();
    await conn.insertInto("coach_admins").values({ email: PROBE }).execute();
    await expect(
      conn.insertInto("coach_admins").values({ email: PROBE }).execute(),
    ).rejects.toThrow();
    await cleanup();
  });

  it("addresses are stored normalized, so casing cannot create a second identity", async () => {
    await cleanup();
    await conn
      .insertInto("coach_admins")
      .values({ email: PROBE.toUpperCase() })
      .execute();
    const row = await conn
      .selectFrom("coach_admins")
      .select("email")
      .where("email", "=", PROBE)
      .executeTakeFirst();
    expect(row?.email).toBe(PROBE);
    await cleanup();
  });

  it("the program admin — who is not a roster leader — is granted the role explicitly", async () => {
    // coach.service.ts resolved admin authority from the bundle's `admins`
    // array; deleting the bundle (7.1) removes the ONLY source of admin
    // authority, so the row has to exist independently of the roster.
    const row = await sql<{ email: string }>`
      SELECT email FROM coach_admins WHERE email = 'andytryba@gmail.com'
    `.execute(conn);
    expect(row.rows.length).toBe(1);
  });
});
