import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import { reattributeSession } from "./coach-attribution";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { MemoryStorage } from "./coach-upload.fixture";
import {
  CoachUploadService,
  DISMISSED_DUPLICATE,
  UPLOAD_MAX_BYTES,
  UPLOAD_PART_BYTES,
  botClassKey,
  markLikelyDuplicate,
  uploadPartKey,
  uploadSessionId,
} from "./coach-upload.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const LEADER = "up-leader";
const OTHER = "up-other";
const SOLO = "up-solo";
const EMAILS = [
  "up-leader@example.test",
  "up-other@example.test",
  "up-solo@example.test",
];
const TODAY = "2026-10-08";
const MB = 1024 ** 2;

let classIds: string[] = [];
let otherClass = "";
let storage: MemoryStorage;
let uploads: CoachUploadService;

async function clear() {
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", [LEADER, OTHER, SOLO])
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where((eb) =>
      eb.or([
        eb("coach_id", "in", [LEADER, OTHER, SOLO]),
        eb("source_session_id", "like", "upload:%"),
        eb("source_session_id", "like", "up-%"),
      ]),
    )
    .execute();
  await conn
    .deleteFrom("coach_uploads")
    .where("coach_id", "in", [LEADER, OTHER, SOLO])
    .execute();
  const users = await conn
    .selectFrom("user")
    .select("id")
    .where("email", "in", EMAILS)
    .execute();
  if (users.length > 0)
    await conn
      .deleteFrom("coach_classes")
      .where(
        "user_id",
        "in",
        users.map((u) => u.id),
      )
      .execute();
  await conn.deleteFrom("user").where("email", "in", EMAILS).execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("slug", "in", [LEADER, OTHER, SOLO])
    .execute();
}

async function account(email: string) {
  const user = await conn
    .insertInto("user")
    .values({ email, firstName: "Test", lastName: "Leader" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return user.id;
}

async function seed() {
  await conn
    .insertInto("coach_leaders")
    .values([
      {
        slug: LEADER,
        email: EMAILS[0],
        name: "Rhea Upton",
        group_name: "Tuesday Men",
      },
      { slug: OTHER, email: EMAILS[1], name: "Otto Vale" },
      { slug: SOLO, email: EMAILS[2], name: "Sol Ivy", group_name: "Lakeside" },
    ])
    .execute();
  const leaderUser = await account(EMAILS[0]);
  const otherUser = await account(EMAILS[1]);
  classIds = [];
  for (const name of ["Thursday Night", "Saturday Morning"]) {
    const row = await conn
      .insertInto("coach_classes")
      .values({
        user_id: leaderUser,
        name,
        zoom_link: `https://zoom.us/j/${name.length}123?pwd=abc`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    classIds.push(String(row.id));
  }
  const row = await conn
    .insertInto("coach_classes")
    .values({ user_id: otherUser, name: "Otto's Class", zoom_link: "" })
    .returning("id")
    .executeTakeFirstOrThrow();
  otherClass = String(row.id);
}

function request(over: Record<string, unknown> = {}) {
  return uploads.request({
    coachId: LEADER,
    classKey: `class:${classIds[0]}`,
    sessionDate: "2026-10-02",
    title: null,
    fileName: "thursday.mp4",
    fileBytes: 130 * MB,
    contentType: "video/mp4",
    byUserId: null,
    byAdmin: false,
    today: TODAY,
    ...over,
  } as never);
}

async function arrive(uploadId: string, parts: number) {
  for (let part = 1; part <= parts; part += 1)
    storage.objects.set(uploadPartKey(uploadId, part), new Uint8Array([part]));
}

async function uploadComplete(over: Record<string, unknown> = {}) {
  const asked = await request(over);
  if (!asked.ok) throw new Error(asked.refusal);
  await arrive(asked.uploadId, asked.parts.length);
  const done = await uploads.complete(asked.uploadId, null);
  if (!done.ok) throw new Error(done.refusal);
  return asked.uploadId;
}

async function session(id: string) {
  return conn
    .selectFrom("coach_intake_sessions")
    .selectAll()
    .where("source_session_id", "=", id)
    .executeTakeFirstOrThrow();
}

async function botSession(
  id: string,
  state: string,
  classKey: string | null,
  coachId: string | null = LEADER,
  date = "2026-10-02",
) {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: coachId,
      matched_by: "title_match",
      title: "Thursday Night",
      session_date: date,
      state,
      class_key: classKey,
    })
    .execute();
}

beforeEach(async () => {
  process.env[COACH_PIPELINE_LIVE] = "true";
  storage = new MemoryStorage();
  uploads = new CoachUploadService(Database, storage);
  await clear();
  await seed();
});
afterEach(async () => {
  delete process.env[COACH_PIPELINE_LIVE];
  await clear();
});

describe("A Leader Can Upload A Session Video (task 4.13)", () => {
  it("The upload page lists only the leader's own classes: registered classes and rotating ones, or their own group when they have neither", async () => {
    expect(await uploads.classesFor(LEADER)).toEqual([
      {
        key: `class:${classIds[1]}`,
        name: "Saturday Morning",
        kind: "registered",
      },
      {
        key: `class:${classIds[0]}`,
        name: "Thursday Night",
        kind: "registered",
      },
    ]);
    expect(await uploads.classesFor(SOLO)).toEqual([
      { key: `group:${SOLO}`, name: "Lakeside", kind: "group" },
    ]);
  });

  it("A leader uploads their session: the file goes straight to storage on short-lived part addresses, then it is received and processing", async () => {
    const asked = await request();
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect(asked.partBytes).toBe(UPLOAD_PART_BYTES);
    expect(asked.parts.length).toBe(Math.ceil((130 * MB) / UPLOAD_PART_BYTES));
    expect(asked.parts[0].url).toContain(uploadPartKey(asked.uploadId, 1));
    expect((await uploads.list(LEADER))[0]).toMatchObject({
      id: asked.uploadId,
      status: "uploading",
    });
    await arrive(asked.uploadId, asked.parts.length);
    expect(await uploads.complete(asked.uploadId, LEADER)).toEqual({
      ok: true,
      status: "processing",
    });
    const received = await session(uploadSessionId(asked.uploadId));
    expect(received).toMatchObject({
      source: "upload",
      coach_id: LEADER,
      matched_by: "upload",
      state: "received",
      class_key: `class:${classIds[0]}`,
      title: "Thursday Night — 2026-10-02",
      parallel_run: false,
    });
    const [listed] = await uploads.list(LEADER);
    expect(listed).toMatchObject({ status: "processing", reportId: null });
    expect(Object.keys(listed)).not.toContain("score");
  });

  it("An uploaded session's report: a title given stands in for the recorded title", async () => {
    const id = await uploadComplete({ title: "Amos, week one" });
    expect((await session(uploadSessionId(id))).title).toBe("Amos, week one");
  });

  it("A leader cannot upload for someone else's class, and nothing is stored", async () => {
    expect(await request({ classKey: `class:${otherClass}` })).toEqual({
      ok: false,
      refusal: "not-your-class",
    });
    expect(storage.signed).toEqual([]);
    expect(await uploads.list(LEADER)).toEqual([]);
  });

  it("A leader with no registered class uploads for their own group", async () => {
    const asked = await request({
      coachId: SOLO,
      classKey: `group:${SOLO}`,
    });
    expect(asked.ok).toBe(true);
  });

  it("An admin uploads for a leader during the parallel run; a leader cannot", async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    expect(await request()).toEqual({ ok: false, refusal: "parallel-run" });
    const id = await uploadComplete({ byAdmin: true });
    expect(await session(uploadSessionId(id))).toMatchObject({
      coach_id: LEADER,
      parallel_run: true,
    });
  });

  it("An uploaded file breaks a limit: over 8 GB, or audio only, or not a supported video, refused naming the limit", async () => {
    expect(await request({ fileBytes: UPLOAD_MAX_BYTES + 1 })).toEqual({
      ok: false,
      refusal: "too-large",
    });
    expect(
      await request({ fileName: "session.mp3", contentType: "audio/mpeg" }),
    ).toEqual({ ok: false, refusal: "not-video" });
    expect(
      await request({
        fileName: "session.avi",
        contentType: "video/x-msvideo",
      }),
    ).toEqual({ ok: false, refusal: "not-video" });
    for (const [fileName, contentType, day] of [
      ["a.mov", "video/quicktime", "11"],
      ["a.webm", "video/webm", "12"],
      ["a.mkv", "video/x-matroska", "13"],
    ])
      expect(
        (
          await request({
            fileName,
            contentType,
            classKey: `class:${classIds[1]}`,
            sessionDate: `2026-09-${day}`,
          })
        ).ok,
      ).toBe(true);
  });

  it("An upload dated in the future or too far back is refused", async () => {
    expect(await request({ sessionDate: "02/10/2026" })).toEqual({
      ok: false,
      refusal: "invalid-date",
    });
    expect(await request({ sessionDate: "2026-10-09" })).toEqual({
      ok: false,
      refusal: "date-in-future",
    });
    expect(await request({ sessionDate: "2026-08-08" })).toEqual({
      ok: false,
      refusal: "date-too-old",
    });
    expect((await request({ sessionDate: "2026-08-09" })).ok).toBe(true);
    expect(
      (await request({ sessionDate: TODAY, classKey: `class:${classIds[1]}` }))
        .ok,
    ).toBe(true);
  });

  it("A second upload for the same date is refused, saying one exists", async () => {
    await uploadComplete();
    expect(await request()).toEqual({ ok: false, refusal: "upload-exists" });
  });

  it("An admin replaces an undelivered upload: the earlier upload and its report are discarded", async () => {
    const first = await uploadComplete();
    await conn
      .insertInto("coach_reports")
      .values({
        id: "up-report-1",
        coach_id: LEADER,
        session_date: "2026-10-02",
        source_session_id: uploadSessionId(first),
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    const replaced = await request({ byAdmin: true, replace: true });
    expect(replaced.ok).toBe(true);
    expect(
      await conn
        .selectFrom("coach_reports")
        .select("id")
        .where("id", "=", "up-report-1")
        .executeTakeFirst(),
    ).toBeUndefined();
    expect((await uploads.list(LEADER)).map((u) => u.id)).not.toContain(first);
  });

  it("a delivered upload cannot be replaced", async () => {
    const first = await uploadComplete();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivered" })
      .where("source_session_id", "=", uploadSessionId(first))
      .execute();
    expect(await request({ byAdmin: true, replace: true })).toEqual({
      ok: false,
      refusal: "not-replaceable",
    });
  });

  it("A second class's session on a bot-recorded date is accepted", async () => {
    await botSession("up-bot-1", "retained", `class:${classIds[0]}`);
    expect((await request({ classKey: `class:${classIds[1]}` })).ok).toBe(true);
  });

  it("The bot already recorded that date: refused saying so", async () => {
    await botSession("up-bot-1", "scored", `class:${classIds[0]}`);
    expect(await request()).toEqual({ ok: false, refusal: "already-recorded" });
  });

  it("A failed bot session does not block an upload", async () => {
    await botSession("up-bot-1", "retrieval_failed", `class:${classIds[0]}`);
    expect((await request()).ok).toBe(true);
  });

  it("an unresolved bot session blocks nothing", async () => {
    await botSession("up-bot-1", "retained", `class:${classIds[0]}`, null);
    expect((await request()).ok).toBe(true);
  });

  it("completing before every part has arrived is refused", async () => {
    const asked = await request();
    if (!asked.ok) throw new Error(asked.refusal);
    expect(await uploads.complete(asked.uploadId, LEADER)).toEqual({
      ok: false,
      refusal: "file-incomplete",
    });
    expect(await uploads.complete(asked.uploadId, OTHER)).toEqual({
      ok: false,
      refusal: "unknown-upload",
    });
  });

  it("An upload for a date the host already reported is listed as a likely duplicate and not scored; dismissing it fails the upload", async () => {
    await conn
      .insertInto("coach_reports")
      .values({
        id: "up-host-report",
        coach_id: LEADER,
        session_date: "2026-10-02",
        source_session_id: `legacy:${LEADER}:2026-10-02`,
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    const id = await uploadComplete();
    expect(await session(uploadSessionId(id))).toMatchObject({
      state: "duplicate",
      duplicate_of: "up-host-report",
    });
    expect((await uploads.list(LEADER))[0].status).toBe("held");
    const listed = (await uploads.likelyDuplicates()).find(
      (d) => d.sourceSessionId === uploadSessionId(id),
    );
    expect(listed).toMatchObject({
      against: "host-report",
      canScoreInstead: false,
    });
    expect(await uploads.dismissDuplicate(uploadSessionId(id))).toBe(true);
    expect((await uploads.list(LEADER))[0]).toMatchObject({
      status: "failed",
      reason: DISMISSED_DUPLICATE,
    });
    expect(
      (await uploads.likelyDuplicates()).some(
        (d) => d.sourceSessionId === uploadSessionId(id),
      ),
    ).toBe(false);
  });

  it("The bot's recording arrives after an upload: the bot session is not scored and is listed as a likely duplicate", async () => {
    const id = await uploadComplete();
    await botSession("up-bot-late", "retained", `class:${classIds[0]}`);
    expect(
      await markLikelyDuplicate(conn as CoachReportsWriter, "up-bot-late"),
    ).toBe(true);
    expect(await session("up-bot-late")).toMatchObject({
      state: "duplicate",
      duplicate_of: uploadSessionId(id),
    });
    expect(
      (await uploads.likelyDuplicates()).find(
        (d) => d.sourceSessionId === "up-bot-late",
      ),
    ).toMatchObject({ against: "upload", canScoreInstead: true });
  });

  it("An admin scores the bot session instead of the upload: the upload and its report are discarded and the bot session is scored", async () => {
    const id = await uploadComplete();
    await botSession("up-bot-late", "retained", `class:${classIds[0]}`);
    await markLikelyDuplicate(conn as CoachReportsWriter, "up-bot-late");
    expect(await uploads.scoreInstead("up-bot-late")).toEqual({ ok: true });
    expect((await session("up-bot-late")).state).toBe("retained");
    expect(
      await conn
        .selectFrom("coach_intake_sessions")
        .select("state")
        .where("source_session_id", "=", uploadSessionId(id))
        .executeTakeFirst(),
    ).toBeUndefined();
    expect((await uploads.list(LEADER)).map((u) => u.id)).not.toContain(id);
  });

  it("the bot session cannot be scored instead once the upload's report was delivered", async () => {
    const id = await uploadComplete();
    await botSession("up-bot-late", "retained", `class:${classIds[0]}`);
    await markLikelyDuplicate(conn as CoachReportsWriter, "up-bot-late");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivered" })
      .where("source_session_id", "=", uploadSessionId(id))
      .execute();
    expect(await uploads.scoreInstead("up-bot-late")).toEqual({
      ok: false,
      refusal: "already-delivered",
    });
  });

  it("A re-attributed bot session lands on an uploaded date: listed as a likely duplicate, not scored", async () => {
    await uploadComplete({ coachId: SOLO, classKey: `group:${SOLO}` });
    await botSession("up-bot-moved", "retained", null, OTHER);
    await reattributeSession(Database, "up-bot-moved", SOLO, OTHER);
    expect(await session("up-bot-moved")).toMatchObject({
      coach_id: SOLO,
      state: "duplicate",
      class_key: `group:${SOLO}`,
    });
  });

  it("the uploader sees each state with no score: held for review, waiting for an admin, attributed to another leader, then a link once delivered", async () => {
    const id = await uploadComplete();
    const sid = uploadSessionId(id);
    const status = async () => (await uploads.list(LEADER))[0];
    await conn
      .insertInto("coach_reports")
      .values({
        id: "up-r",
        coach_id: LEADER,
        session_date: "2026-10-02",
        source_session_id: sid,
        legacy_ids: [],
        summary: {},
        metrics: {},
        body: {},
      })
      .execute();
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "scored", hold_kind: "review", report_id: "up-r" })
      .where("source_session_id", "=", sid)
      .execute();
    expect((await status()).status).toBe("held");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "retained", coach_id: null, leader_cue: "none" })
      .where("source_session_id", "=", sid)
      .execute();
    expect((await status()).status).toBe("waiting-for-admin");
    await conn
      .updateTable("coach_intake_sessions")
      .set({ coach_id: OTHER, leader_cue: "reading" })
      .where("source_session_id", "=", sid)
      .execute();
    expect(await status()).toMatchObject({
      status: "attributed-elsewhere",
      reportId: null,
    });
    await conn
      .updateTable("coach_intake_sessions")
      .set({ coach_id: LEADER, state: "delivered", hold_kind: null })
      .where("source_session_id", "=", sid)
      .execute();
    expect(await status()).toMatchObject({ status: "ready", reportId: "up-r" });
  });

  it("a recording-bot session's class is the registered class whose meeting link it recorded, else the leader's only class or own group", async () => {
    const writer = conn as CoachReportsWriter;
    expect(
      await botClassKey(writer, {
        coachId: LEADER,
        rotatingClassId: null,
        meetingLink: `HTTPS://zoom.us/j/${"Saturday Morning".length}123?pwd=other`,
      }),
    ).toBe(`class:${classIds[1]}`);
    expect(
      await botClassKey(writer, {
        coachId: LEADER,
        rotatingClassId: null,
        meetingLink: null,
      }),
    ).toBeNull();
    expect(
      await botClassKey(writer, {
        coachId: OTHER,
        rotatingClassId: null,
        meetingLink: null,
      }),
    ).toBe(`class:${otherClass}`);
    expect(
      await botClassKey(writer, {
        coachId: SOLO,
        rotatingClassId: null,
        meetingLink: null,
      }),
    ).toBe(`group:${SOLO}`);
    expect(
      await botClassKey(writer, {
        coachId: null,
        rotatingClassId: 7,
        meetingLink: null,
      }),
    ).toBe("rotating:7");
  });

  it("A leader who uploads is covered: the received upload counts as an observed session", async () => {
    await uploadComplete();
    const observed = await conn
      .selectFrom("coach_intake_sessions")
      .select("observed_at")
      .where("source", "=", "upload")
      .where("coach_id", "=", LEADER)
      .executeTakeFirstOrThrow();
    expect(Date.now() - new Date(observed.observed_at).getTime()).toBeLessThan(
      60_000,
    );
    const { rows } = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM coach_intake_sessions
      WHERE coach_id = ${LEADER} AND observed_at >= now() - interval '28 days'
    `.execute(conn);
    expect(rows[0].n).toBe(1);
  });
});
