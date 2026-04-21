/**
 * TASK-005 integration — AudioProgressService against real Postgres.
 * Does NOT exercise the HTTP layer directly (that's covered by the
 * service unit tests via the DTO shape and the Elysia plugin wiring).
 * The integration layer's job is to catch schema mismatches: the
 * position/duration numeric(8,2) columns, unique constraint enforcement
 * across upserts, and the validate-on-read cross-table join via
 * explanation_audios.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { db as Database } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { AudioProgressService } from "./audio-progress.service";

const TEST_LANG = `z${(Date.now() % 1_000_000).toString(36)}`.slice(0, 10);

let userId: string;
let explanationId: number;

async function seed(): Promise<void> {
  const conn = Database.getOrCreateConnection();

  const user = await conn
    .insertInto("user")
    .values({
      email: `task005-${randomUUID()}@test.local`,
      firstName: "Task5",
      lastName: "Test",
      password: "hashed",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  userId = user.id;

  const chapter = await conn
    .selectFrom("chapters")
    .select(["chapter_id"])
    .where("book_id", "=", 1)
    .where("chapter_number", "=", 1)
    .executeTakeFirstOrThrow();

  const inserted = await conn
    .insertInto("explanations")
    .values({
      type: ExplanationTypeEnum.summary,
      explanation: "Resume progress test text",
      chapter_id: chapter.chapter_id,
      version: 1,
      is_active: true,
      created_by_admin: true,
      parent_explanation_id: null,
      language_code: TEST_LANG,
    })
    .returning(["explanation_id"])
    .executeTakeFirstOrThrow();
  explanationId = inserted.explanation_id;
}

async function insertAudioDuration(duration_seconds: number): Promise<void> {
  await Database.getOrCreateConnection()
    .insertInto("explanation_audios")
    .values({
      audio_id: randomUUID(),
      explanation_id: explanationId,
      voice: "alloy",
      language_code: TEST_LANG,
      storage_key: `dummy/${explanationId}/alloy/${TEST_LANG}/x.mp3`,
      duration_seconds,
      character_count: 10,
      content_hash: `h-${Date.now()}`,
      tts_provider: "openai",
      tts_model: "tts-1-hd",
      is_stale: false,
    })
    .execute();
}

async function cleanup(): Promise<void> {
  const conn = Database.getOrCreateConnection();
  if (explanationId) {
    await conn
      .deleteFrom("explanation_audio_progress")
      .where("explanation_id", "=", explanationId)
      .execute();
    await conn
      .deleteFrom("explanation_audios")
      .where("explanation_id", "=", explanationId)
      .execute();
    await conn
      .deleteFrom("explanations")
      .where("explanation_id", "=", explanationId)
      .execute();
  }
  if (userId) {
    await conn.deleteFrom("user").where("id", "=", userId).execute();
  }
}

describe("AudioProgressService — integration (Postgres)", () => {
  let service: AudioProgressService;

  beforeAll(async () => {
    await seed();
    service = new AudioProgressService(Database);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("save → read → delete full round trip", async () => {
    const save = await service.savePosition({
      userId,
      explanationId,
      positionSeconds: 100,
      durationSeconds: 200,
      reason: "pause",
    });
    expect(save.kind).toBe("saved");

    const read1 = await service.getPosition(userId, explanationId);
    expect(read1?.position_seconds).toBe(100);
    expect(read1?.duration_seconds).toBe(200);

    // Overwrite with a later position — unique index means upsert replaces.
    const save2 = await service.savePosition({
      userId,
      explanationId,
      positionSeconds: 150,
      durationSeconds: 200,
      reason: "pause",
    });
    expect(save2.kind).toBe("saved");

    const read2 = await service.getPosition(userId, explanationId);
    expect(read2?.position_seconds).toBe(150);

    // Explicit completion.
    await service.savePosition({
      userId,
      explanationId,
      positionSeconds: 5,
      durationSeconds: 200,
      reason: "complete",
    });
    const read3 = await service.getPosition(userId, explanationId);
    expect(read3).toBeUndefined();
  });

  it("validate-on-read: stored pos=180 but a 150s audio exists → undefined", async () => {
    await service.savePosition({
      userId,
      explanationId,
      positionSeconds: 180,
      durationSeconds: 200,
      reason: "pause",
    });
    await insertAudioDuration(150);

    const read = await service.getPosition(userId, explanationId);
    expect(read).toBeUndefined();

    // Cleanup for next test.
    await service.clearPosition(userId, explanationId);
    await Database.getOrCreateConnection()
      .deleteFrom("explanation_audios")
      .where("explanation_id", "=", explanationId)
      .execute();
  });

  it("validate-on-read: with current audio 200s and stored pos=100 → still readable", async () => {
    await service.savePosition({
      userId,
      explanationId,
      positionSeconds: 100,
      durationSeconds: 200,
      reason: "pause",
    });
    await insertAudioDuration(200);

    const read = await service.getPosition(userId, explanationId);
    expect(read?.position_seconds).toBe(100);

    await service.clearPosition(userId, explanationId);
    await Database.getOrCreateConnection()
      .deleteFrom("explanation_audios")
      .where("explanation_id", "=", explanationId)
      .execute();
  });

  it("guest POST/GET/DELETE are all no-ops", async () => {
    const save = await service.savePosition({
      userId: null,
      explanationId,
      positionSeconds: 100,
      durationSeconds: 200,
      reason: "pause",
    });
    expect(save.kind).toBe("skipped");

    const read = await service.getPosition(null, explanationId);
    expect(read).toBeUndefined();

    await service.clearPosition(null, explanationId);

    // Verify no row exists in the DB for any user.
    const rows = await Database.getOrCreateConnection()
      .selectFrom("explanation_audio_progress")
      .selectAll()
      .where("explanation_id", "=", explanationId)
      .execute();
    expect(rows).toHaveLength(0);
  });
});
