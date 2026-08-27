import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { getTestClient } from "../shared/test-client";
import Backend, { type CoachPlugin } from "./coach.plugin";

const client = getTestClient<CoachPlugin>(Backend);
const conn = Database.getOrCreateConnection();
const TOKEN = "test-publish-token";

function payload(
  reports: Array<{ coachId: string; date: string; id?: string }>,
) {
  return {
    reports: reports.map((r) => ({
      ...r,
      // Complete payload: the store rejects a report missing any field the read
      // contract (ReportSchema) requires, so a bad publish cannot poison reads.
      summary: {
        dateLabel: r.date,
        session: `S ${r.date}`,
        topic: "Joel",
        duration: "~60 min",
        attendees: 12,
        newcomers: 0,
        score: 70,
        status: "On Target",
        statusEmoji: "🟡",
        docUrl: "https://example/doc",
        pdfUrl: "https://example/report.pdf",
      },
      metrics: {
        base: 70,
        newcomerBonus: 0,
        sizeBonus: 0,
        clusters: [],
        dimensions: [],
      },
      body: { bigIdeas: ["idea"], feedback: { headline: "ok" }, sections: [] },
    })),
    generatedAt: "2026-08-25",
  };
}

// Scoped to this file's coaches — an unscoped delete would wipe a real corpus
// on whichever database POSTGRES_URL points at.
const TEST_COACHES = ["c1", "c2"];

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", TEST_COACHES)
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("POST /coach/ingest", () => {
  beforeEach(async () => {
    process.env.COACH_PUBLISH_TOKEN = TOKEN;
    await clear();
  });
  afterAll(async () => {
    await clear();
    Reflect.deleteProperty(process.env, "COACH_PUBLISH_TOKEN");
  });

  it("rejects a request with no publish credential", async () => {
    const { error } = await client.coach.ingest.post(
      payload([{ coachId: "c1", date: "2026-08-22" }]),
    );
    expect(error).toBeTruthy();
    expect((error as { status?: number } | null)?.status).toBe(401);
  });

  it("rejects a wrong credential", async () => {
    const { error } = await client.coach.ingest.post(
      payload([{ coachId: "c1", date: "2026-08-22" }]),
      { headers: { authorization: "Bearer nope" } },
    );
    expect((error as { status?: number } | null)?.status).toBe(401);
  });

  it("rejects a user session token (publish scope is not admin auth)", async () => {
    // a plausible-looking JWT is still not the publish credential
    const { error } = await client.coach.ingest.post(
      payload([{ coachId: "c1", date: "2026-08-22" }]),
      { headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.fake.sig" } },
    );
    expect((error as { status?: number } | null)?.status).toBe(401);
  });

  it("publishes reports and returns each assigned id + provenance", async () => {
    const { data, error } = await client.coach.ingest.post(
      payload([
        { coachId: "c1", date: "2026-08-22", id: "c1-2026-08-22-slug" },
        { coachId: "c2", date: "2026-08-21", id: "c2-2026-08-21-slug" },
      ]),
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    if (error) throw error;
    expect(data?.accepted.length).toBe(2);
    expect(data?.accepted[0].id).toBe("c1-2026-08-22-slug");
    expect(data?.accepted[0].created).toBe(true);
    expect(data?.reportCount).toBe(2);
    expect(Number(data?.version)).toBeGreaterThan(0);
  });

  it("re-publishing the same session keeps its id (delivered links stay valid)", async () => {
    await client.coach.ingest.post(
      payload([{ coachId: "c1", date: "2026-08-22", id: "original-slug" }]),
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    const { data } = await client.coach.ingest.post(
      payload([{ coachId: "c1", date: "2026-08-22", id: "retitled-slug" }]),
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    expect(data?.accepted[0].id).toBe("original-slug");
    expect(data?.accepted[0].created).toBe(false);
    expect(data?.reportCount).toBe(1); // updated in place, not duplicated
  });

  it("rejects a report missing fields the read contract requires", async () => {
    const { error } = await client.coach.ingest.post(
      {
        reports: [
          {
            coachId: "c1",
            date: "2026-08-22",
            summary: { session: "partial" }, // missing score, status, pdfUrl, ...
            metrics: {},
            body: {},
          },
        ],
      },
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    expect(error).toBeTruthy();
    const rows = await conn
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(0); // nothing written — validated before any write
  });

  it("rejects a malformed date rather than 500ing from the driver", async () => {
    const bad = payload([{ coachId: "c1", date: "Aug 22, 2026" }]);
    const { error } = await client.coach.ingest.post(bad, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(error).toBeTruthy();
  });

  it("refuses a publish that would shrink the corpus", async () => {
    await client.coach.ingest.post(
      payload([
        { coachId: "c1", date: "2026-08-22" },
        { coachId: "c2", date: "2026-08-21" },
      ]),
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    // a stale publisher believing it holds only 1 session
    const { error } = await client.coach.ingest.post(
      { ...payload([{ coachId: "c1", date: "2026-08-22" }]), expectedCount: 1 },
      { headers: { authorization: `Bearer ${TOKEN}` } },
    );
    expect(error).toBeTruthy();
    const remaining = await conn
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .executeTakeFirstOrThrow();
    expect(Number(remaining.n)).toBe(2); // corpus intact
  });
});
