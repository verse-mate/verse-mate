import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { fixtureReport } from "./coach-fixture";
import { reportToRow } from "./coach-store.transform";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const EMAIL = "post-bundle-leader@example.test";
const SLUG = "post-bundle-leader";
const UUID_EMAIL = "uuid-only-leader@example.test";

const service = new CoachService(Database);

async function clear() {
  await conn.deleteFrom("coach_reports").where("coach_id", "=", SLUG).execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("email", "in", [EMAIL, UUID_EMAIL])
    .execute();
}

describe("the id the oversight roster lists is the id the drill-in accepts", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values({ slug: SLUG, email: EMAIL, name: "Post Bundle Leader" })
      .execute();
    await conn
      .insertInto("coach_reports")
      .values({
        ...reportToRow(
          SLUG,
          fixtureReport("post-bundle-report-1", "2026-09-19", 70) as never,
        ),
        source_session_id: "ff-post-bundle-1",
      })
      .execute();
  });
  afterEach(clear);

  it("a slugged leader absent from the bundle, every leader's shape once task 7.1 runs, opens by the listed id", async () => {
    const listed = (await service.listCoaches()).find(
      (c) => c.name === "Post Bundle Leader",
    );
    expect(listed?.id).toBe(SLUG);

    const reports = await service.getReportsById(listed?.id as string);
    expect(reports?.map((r) => r.id)).toEqual(["post-bundle-report-1"]);
    expect(await service.getTrendsById(SLUG)).not.toBeNull();
    expect((await service.getProfileById(SLUG))?.id).toBe(SLUG);
    expect(await service.getMonthlySummaryById(SLUG, "2026-09")).not.toBeNull();
  });

  it("every leader the roster lists resolves through the drill-in", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: null, email: UUID_EMAIL, name: "Uuid Only Leader" })
      .execute();
    for (const c of await service.listCoaches()) {
      expect({
        id: c.id,
        found: (await service.getReportsById(c.id)) !== null,
      }).toEqual({ id: c.id, found: true });
    }
  });
});
