import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const service = new CoachService(Database);

const A = "corpus-guard-a";
const B = "corpus-guard-b";

function report(coachId: string, sourceSessionId: string, date: string) {
  return {
    coachId,
    date,
    sourceSessionId,
    summary: {
      dateLabel: date,
      session: `S ${sourceSessionId}`,
      topic: "Joel",
      duration: 60,
      attendees: 9,
      newcomers: 1,
      score: 70,
      status: "On Target",
      statusEmoji: "🟢",
      docUrl: "",
      pdfUrl: "",
    },
    metrics: {
      base: 60,
      newcomerBonus: 5,
      sizeBonus: 5,
      clusters: [],
      dimensions: [],
    },
    body: { bigIdeas: ["x"], feedback: { headline: "ok" } },
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", [A, B])
    .execute();
  await conn.deleteFrom("coach_dataset_meta").execute();
}

describe("the corpus guard is evaluated per leader", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a write advances the version and the count reflects the stored corpus", async () => {
    const first = await service.ingestReports({
      reports: [report(A, "a-1", "2026-08-01")],
    });
    expect(first.version).toBe("1");
    expect(first.reportCount).toBe(1);

    const second = await service.ingestReports({
      reports: [report(A, "a-2", "2026-08-08")],
    });
    expect(Number(second.version)).toBeGreaterThan(Number(first.version));
    expect(second.reportCount).toBe(2);
  });

  it("a write claiming FEWER reports for a leader than are stored is refused", async () => {
    await service.ingestReports({
      reports: [
        report(A, "a-1", "2026-08-01"),
        report(A, "a-2", "2026-08-08"),
        report(A, "a-3", "2026-08-15"),
      ],
    });

    await expect(
      service.ingestReports({
        reports: [report(A, "a-1", "2026-08-01")],
        expectedCounts: { [A]: 1 },
      }),
    ).rejects.toThrow(new RegExp(A));

    const still = await conn
      .selectFrom("coach_reports")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("coach_id", "=", A)
      .executeTakeFirstOrThrow();
    expect(Number(still.n)).toBe(3);
  });

  it("one leader's new session is accepted while ANOTHER leader holds more reports", async () => {
    // The global-count guard refused exactly this: leader B's incremental
    // publish was compared against every leader's rows, so a publish of one
    // report looked like a corpus of 1 replacing a corpus of 4.
    await service.ingestReports({
      reports: [
        report(A, "a-1", "2026-08-01"),
        report(A, "a-2", "2026-08-08"),
        report(A, "a-3", "2026-08-15"),
      ],
    });

    const incremental = await service.ingestReports({
      reports: [report(B, "b-1", "2026-08-16")],
      expectedCounts: { [B]: 1 },
    });
    expect(incremental.accepted.length).toBe(1);
    expect(incremental.reportCount).toBe(4);
  });

  it("a leader NOT named in the batch is never judged by it", async () => {
    await service.ingestReports({
      reports: [report(A, "a-1", "2026-08-01"), report(A, "a-2", "2026-08-08")],
    });
    // B publishes; A's two stored reports must not make this a regression.
    await service.ingestReports({
      reports: [report(B, "b-1", "2026-08-16")],
      expectedCounts: { [B]: 1 },
    });
    const counts = await conn
      .selectFrom("coach_reports")
      .select(["coach_id"])
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("coach_id", "in", [A, B])
      .groupBy("coach_id")
      .execute();
    expect(new Map(counts.map((c) => [c.coach_id, Number(c.n)]))).toEqual(
      new Map([
        [A, 2],
        [B, 1],
      ]),
    );
  });
});
