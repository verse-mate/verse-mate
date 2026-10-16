import { sql } from "kysely";
import { loadBible } from "../bible/bible";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../common/errors";
import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";
import { COACH_REFUSALS } from "./coach.schema";
import type { CoachService } from "./coach.service";

export const VIDEO_MAX_BYTES = 2 * 1024 ** 3;
export const VIDEO_URL_SECONDS = 60 * 60;
export const VIDEO_UPLOAD_URL_SECONDS = 15 * 60;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];
export const LEARNERS_PAGE = 25;

export type LearningStorage = Pick<
  ObjectStorageService,
  | "getGlobalObjectUploadUrl"
  | "getGlobalObjectUrl"
  | "getGlobalObjectRange"
  | "objectSize"
  | "deleteObject"
>;

const REFUSAL_ERRORS = {
  400: ValidationError,
  403: ForbiddenError,
  404: NotFoundError,
  409: ConflictError,
} as const;

const refuse = (
  code: string,
  message: string,
  status: keyof typeof REFUSAL_ERRORS = 409,
  details: Record<string, unknown> = {},
) => new REFUSAL_ERRORS[status](message, { refusal: code, ...details });

export interface Passage {
  bookId: number;
  chapter: number;
  verseStart?: number | null;
  verseEnd?: number | null;
}

type BookShape = { name: string; verses: number[] };
let books: Promise<Map<number, BookShape>> | null = null;

function bibleShape(): Promise<Map<number, BookShape>> {
  books ??= loadBible().then(
    (bible) =>
      new Map(
        bible.books.map((b) => [
          b.bookId,
          {
            name: b.name,
            verses: [...b.chapters]
              .sort((x, y) => x.chapterId - y.chapterId)
              .map((c) => c.verses.length),
          },
        ]),
      ),
    (error) => {
      books = null;
      throw error;
    },
  );
  return books;
}

export async function checkPassages(passages: Passage[]) {
  const shape = await bibleShape();
  return passages.map((p, i) => {
    const where = `Passage ${i + 1}`;
    const book = shape.get(p.bookId);
    if (!book) throw refuse("invalid-passage", `${where}: no such book`, 400);
    const verses = book.verses[p.chapter - 1];
    if (!Number.isInteger(p.chapter) || !verses)
      throw refuse(
        "invalid-passage",
        `${where}: ${book.name} has no chapter ${p.chapter}`,
        400,
      );
    const start = p.verseStart ?? null;
    const end = p.verseEnd ?? null;
    if (start === null && end !== null)
      throw refuse(
        "invalid-passage",
        `${where}: a range needs a first verse`,
        400,
      );
    for (const v of [start, end])
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > verses))
        throw refuse(
          "invalid-passage",
          `${where}: ${book.name} ${p.chapter} has ${verses} verses`,
          400,
        );
    if (start !== null && end !== null && end < start)
      throw refuse(
        "invalid-passage",
        `${where}: the range ends before it starts`,
        400,
      );
    return {
      bookId: p.bookId,
      chapter: p.chapter,
      verseStart: start,
      verseEnd: end,
    };
  });
}

async function describePassages(stored: unknown) {
  const shape = await bibleShape();
  return ((stored as Passage[] | null) ?? []).map((p) => ({
    bookId: p.bookId,
    bookName: shape.get(p.bookId)?.name ?? "",
    chapter: p.chapter,
    verseStart: p.verseStart ?? null,
    verseEnd: p.verseEnd ?? null,
  }));
}

export function checkQuestion(input: {
  prompt: string;
  options: string[];
  correct: number;
}) {
  const prompt = input.prompt.trim();
  const options = input.options.map((o) => o.trim());
  if (!prompt) throw refuse("invalid-question", "Write the question", 400);
  if (options.length < 2 || options.length > 6)
    throw refuse(
      "invalid-question",
      "A question has between two and six options",
      400,
    );
  if (options.some((o) => !o))
    throw refuse("invalid-question", "Every option needs text", 400);
  if (
    !Number.isInteger(input.correct) ||
    input.correct < 0 ||
    input.correct >= options.length
  )
    throw refuse("invalid-question", "Mark exactly one option as correct", 400);
  return { prompt, options, correct: input.correct };
}

export function videoTypeOf(head: Uint8Array | null): VideoType | null {
  if (!head || head.length < 8) return null;
  if (
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  )
    return "video/webm";
  if (String.fromCharCode(...head.slice(4, 8)) === "ftyp") return "video/mp4";
  return null;
}

const videoSlot = (lessonId: number, current: string | null) =>
  `coach-learning/lessons/${lessonId}/${current?.endsWith("/a") ? "b" : "a"}`;

const videoSlots = (lessonId: number) => [
  `coach-learning/lessons/${lessonId}/a`,
  `coach-learning/lessons/${lessonId}/b`,
];

type StepState = "locked" | "open" | "done";
type CheckState = "locked" | "open" | "passed";

interface PathModule {
  id: number;
  title: string;
  description: string;
  passMark: number;
  state: CheckState;
  bestScore: number | null;
  questionCount: number;
  lessons: Array<{ id: number; title: string; state: StepState }>;
}

export type Continue =
  | { kind: "lesson"; lessonId: number; moduleId: number }
  | { kind: "check"; moduleId: number }
  | null;

interface Facts {
  done: Set<number>;
  passed: Set<number>;
  best: Map<number, number>;
}

export function derivePath(
  modules: Array<{
    id: number;
    title: string;
    description: string;
    pass_mark: number;
    questionCount: number;
    lessons: Array<{ id: number; title: string }>;
  }>,
  facts: Facts,
): { modules: PathModule[]; next: Continue; passed: number } {
  let priorPassed = true;
  let next: Continue = null;
  const path = modules.map((m) => {
    const passed = facts.passed.has(m.id);
    let earlierDone = true;
    const lessons = m.lessons.map((l) => {
      const done = facts.done.has(l.id);
      const open = done || passed || (priorPassed && earlierDone);
      earlierDone &&= done;
      if (!done && !next)
        next = { kind: "lesson", lessonId: l.id, moduleId: m.id };
      return {
        id: l.id,
        title: l.title,
        state: (done ? "done" : open ? "open" : "locked") as StepState,
      };
    });
    if (!passed && !next) next = { kind: "check", moduleId: m.id };
    const state: CheckState = passed
      ? "passed"
      : priorPassed && earlierDone
        ? "open"
        : "locked";
    priorPassed &&= passed;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      passMark: m.pass_mark,
      state,
      bestScore: facts.best.get(m.id) ?? null,
      questionCount: m.questionCount,
      lessons,
    };
  });
  return {
    modules: path,
    next,
    passed: path.filter((m) => m.state === "passed").length,
  };
}

const checkChanged = () =>
  refuse(
    "check-changed",
    "The check changed while you were answering it. Here it is as it stands now.",
  );

const percent = (correct: number, total: number) =>
  total === 0 ? 0 : Math.round((correct * 10000) / total) / 100;

export class CoachLearningService {
  private readonly storage: LearningStorage;

  constructor(
    private readonly db: db,
    storage?: LearningStorage,
  ) {
    this.storage = storage ?? new ObjectStorageService();
  }

  private get conn() {
    return this.db.getOrCreateConnection();
  }

  private async publishedTree() {
    const modules = await this.conn
      .selectFrom("coach_learning_modules")
      .select(["id", "title", "description", "pass_mark"])
      .where("published", "=", true)
      .orderBy("position")
      .orderBy("id")
      .execute();
    if (modules.length === 0) return [];
    const ids = modules.map((m) => m.id);
    const lessons = await this.conn
      .selectFrom("coach_learning_lessons")
      .select(["id", "title", "module_id"])
      .where("published", "=", true)
      .where("module_id", "in", ids)
      .orderBy("position")
      .orderBy("id")
      .execute();
    const counts = await this.conn
      .selectFrom("coach_learning_questions")
      .select(["module_id", sql<number>`count(*)::int`.as("n")])
      .where("module_id", "in", ids)
      .groupBy("module_id")
      .execute();
    return modules.map((m) => ({
      ...m,
      questionCount: counts.find((c) => c.module_id === m.id)?.n ?? 0,
      lessons: lessons.filter((l) => l.module_id === m.id),
    }));
  }

  private async facts(userId: string): Promise<Facts> {
    const done = await this.conn
      .selectFrom("coach_learning_lesson_completions")
      .select("lesson_id")
      .where("user_id", "=", userId as never)
      .execute();
    const subs = await this.conn
      .selectFrom("coach_learning_submissions")
      .select(["module_id", "correct", "total", "passed"])
      .where("user_id", "=", userId as never)
      .execute();
    const best = new Map<number, number>();
    for (const s of subs)
      best.set(
        s.module_id,
        Math.max(best.get(s.module_id) ?? 0, percent(s.correct, s.total)),
      );
    return {
      done: new Set(done.map((d) => d.lesson_id)),
      passed: new Set(subs.filter((s) => s.passed).map((s) => s.module_id)),
      best,
    };
  }

  private enrolment(userId: string) {
    return this.conn
      .selectFrom("coach_learning_enrolments")
      .selectAll()
      .where("user_id", "=", userId as never)
      .executeTakeFirst();
  }

  private async account(userId: string) {
    const user = await this.conn
      .selectFrom("user")
      .select([
        "email",
        "firstName",
        "lastName",
        "emailVerified",
        "email_verified_at",
      ])
      .where("id", "=", userId as never)
      .executeTakeFirst();
    return {
      email: user?.email?.trim().toLowerCase() ?? "",
      name: [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim(),
      confirmed: Boolean(user?.emailVerified && user?.email_verified_at),
    };
  }

  private async latestRequest(userId: string) {
    const row = await this.conn
      .selectFrom("coach_learning_join_requests")
      .select(["id", "status", "reason", "note", "created_at", "answered_at"])
      .where("user_id", "=", userId as never)
      .orderBy("id", "desc")
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          status: row.status as
            | "open"
            | "approved"
            | "declined"
            | "already-in-program",
          reason: row.reason,
          note: row.note,
          sentAt: row.created_at.toISOString(),
          answeredAt: row.answered_at?.toISOString() ?? null,
        }
      : null;
  }

  async isOpen(): Promise<boolean> {
    return (
      (await this.conn
        .selectFrom("coach_learning_modules")
        .select("id")
        .where("published", "=", true)
        .executeTakeFirst()) !== undefined
    );
  }

  async state(userId: string, coach: CoachService) {
    const tree = await this.publishedTree();
    const facts = await this.facts(userId);
    const path = derivePath(tree, facts);
    let enrolment = await this.enrolment(userId);
    if (
      enrolment &&
      !enrolment.completed_at &&
      tree.length > 0 &&
      path.passed === tree.length
    ) {
      await this.conn
        .updateTable("coach_learning_enrolments")
        .set({ completed_at: sql`now()` })
        .where("user_id", "=", userId as never)
        .where("completed_at", "is", null)
        .execute();
      enrolment = await this.enrolment(userId);
    }
    const account = await this.account(userId);
    return {
      open: tree.length > 0,
      enrolledAt: enrolment?.enrolled_at.toISOString() ?? null,
      completedAt: enrolment?.completed_at?.toISOString() ?? null,
      passed: path.passed,
      total: tree.length,
      next: enrolment ? path.next : null,
      modules: path.modules,
      isLeader: await coach.isCoach(userId),
      addressConfirmed: account.confirmed,
      request: await this.latestRequest(userId),
    };
  }

  async enrol(userId: string) {
    if (!(await this.isOpen()))
      throw refuse("not-open", "The learning program is not open yet");
    await this.conn
      .insertInto("coach_learning_enrolments")
      .values({ user_id: userId as never })
      .onConflict((oc) => oc.column("user_id").doNothing())
      .execute();
  }

  private async learnerPath(userId: string) {
    if (!(await this.enrolment(userId)))
      throw refuse("not-enrolled", "Start the program first", 403);
    const tree = await this.publishedTree();
    return derivePath(tree, await this.facts(userId));
  }

  private async lessonRow(lessonId: number) {
    return this.conn
      .selectFrom("coach_learning_lessons as l")
      .innerJoin("coach_learning_modules as m", "m.id", "l.module_id")
      .select([
        "l.id",
        "l.module_id",
        "l.title",
        "l.body",
        "l.passages",
        "l.published",
        "l.video_key",
        "l.video_type",
        "m.published as module_published",
        "m.title as module_title",
      ])
      .where("l.id", "=", lessonId)
      .executeTakeFirst();
  }

  private async openLesson(userId: string, lessonId: number) {
    const row = await this.lessonRow(lessonId);
    if (!row?.published || !row.module_published)
      throw refuse("unknown-lesson", "No such lesson", 404);
    const path = await this.learnerPath(userId);
    const step = path.modules
      .flatMap((m) => m.lessons)
      .find((l) => l.id === lessonId);
    if (!step || step.state === "locked")
      throw refuse("locked", "This lesson is locked", 403, {
        next: path.next,
      });
    return { row, step };
  }

  private async lessonView(
    row: NonNullable<Awaited<ReturnType<CoachLearningService["lessonRow"]>>>,
    done: boolean,
  ) {
    return {
      id: row.id,
      moduleId: row.module_id,
      moduleTitle: row.module_title,
      title: row.title,
      body: row.body,
      passages: await describePassages(row.passages),
      hasVideo: row.video_key !== null,
      done,
      draft: !(row.published && row.module_published),
    };
  }

  async lesson(userId: string, lessonId: number) {
    const { row, step } = await this.openLesson(userId, lessonId);
    return this.lessonView(row, step.state === "done");
  }

  async markDone(userId: string, lessonId: number) {
    await this.openLesson(userId, lessonId);
    await this.conn
      .insertInto("coach_learning_lesson_completions")
      .values({ user_id: userId as never, lesson_id: lessonId })
      .onConflict((oc) => oc.columns(["user_id", "lesson_id"]).doNothing())
      .execute();
  }

  async videoUrl(userId: string, lessonId: number, admin: boolean) {
    const row = admin
      ? await this.lessonRow(lessonId)
      : (await this.openLesson(userId, lessonId)).row;
    if (!row) throw refuse("unknown-lesson", "No such lesson", 404);
    if (!row.video_key)
      throw refuse("no-video", "This lesson has no video", 404);
    return {
      url: await this.storage.getGlobalObjectUrl({
        key: row.video_key,
        expiresInSeconds: VIDEO_URL_SECONDS,
      }),
      type: row.video_type ?? "video/mp4",
      expiresInSeconds: VIDEO_URL_SECONDS,
    };
  }

  private async questions(moduleId: number) {
    return this.conn
      .selectFrom("coach_learning_questions")
      .select(["id", "prompt", "options", "correct"])
      .where("module_id", "=", moduleId)
      .orderBy("position")
      .orderBy("id")
      .execute();
  }

  private async openCheck(userId: string, moduleId: number) {
    const module = await this.conn
      .selectFrom("coach_learning_modules")
      .select(["id", "title", "pass_mark", "check_version", "published"])
      .where("id", "=", moduleId)
      .executeTakeFirst();
    if (!module?.published)
      throw refuse("unknown-module", "No such module", 404);
    const path = await this.learnerPath(userId);
    const step = path.modules.find((m) => m.id === moduleId);
    if (!step || step.state === "locked")
      throw refuse("locked", "Finish the module's lessons first", 403, {
        next: path.next,
      });
    return { module, step };
  }

  async check(userId: string, moduleId: number) {
    const { module, step } = await this.openCheck(userId, moduleId);
    const questions = await this.questions(moduleId);
    return {
      moduleId,
      title: module.title,
      passMark: module.pass_mark,
      version: module.check_version,
      passed: step.state === "passed",
      bestScore: step.bestScore,
      questions: questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options,
      })),
    };
  }

  async submit(
    userId: string,
    moduleId: number,
    input: {
      version: number;
      answers: Array<{ questionId: number; option: number }>;
    },
  ) {
    const { module } = await this.openCheck(userId, moduleId);
    if (input.version !== module.check_version) throw checkChanged();
    const questions = await this.questions(moduleId);
    const answers = new Map(input.answers.map((a) => [a.questionId, a.option]));
    if (
      questions.length === 0 ||
      answers.size !== input.answers.length ||
      questions.some((q) => {
        const a = answers.get(q.id);
        return a === undefined || a < 0 || a >= q.options.length;
      }) ||
      answers.size !== questions.length
    )
      throw refuse("incomplete", "Answer every question first", 400);
    const wrong = questions
      .map((q, i) => (answers.get(q.id) === q.correct ? 0 : i + 1))
      .filter((n) => n > 0);
    const correct = questions.length - wrong.length;
    const passed = correct * 100 >= module.pass_mark * questions.length;
    const inserted = await sql`
      insert into coach_learning_submissions (user_id, module_id, correct, total, passed)
      select ${userId}, id, ${correct}, ${questions.length}, ${passed}
      from coach_learning_modules
      where id = ${moduleId} and check_version = ${input.version}`.execute(
      this.conn,
    );
    if (!inserted.numAffectedRows) throw checkChanged();
    const facts = await this.facts(userId);
    return {
      score: percent(correct, questions.length),
      correct,
      total: questions.length,
      passed,
      passMark: module.pass_mark,
      wrong,
      bestScore: facts.best.get(moduleId) ?? null,
      modulePassed: facts.passed.has(moduleId),
    };
  }

  async sendRequest(userId: string, note: string, coach: CoachService) {
    const enrolment = await this.enrolment(userId);
    if (!enrolment?.completed_at)
      throw refuse("not-completed", "Complete the program first");
    if (await coach.isCoach(userId))
      throw refuse("already-leader", "You are already in the coaching program");
    if (!(await this.account(userId)).confirmed)
      throw refuse(
        "confirm-email",
        "Confirm your email address first: open the link we send you",
        403,
      );
    const standing = await this.latestRequest(userId);
    if (standing && standing.status !== "declined")
      throw refuse("request-exists", "You already sent a request", 409, {
        request: standing,
      });
    try {
      await this.conn
        .insertInto("coach_learning_join_requests")
        .values({ user_id: userId as never, note: note.trim() })
        .execute();
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      throw refuse("request-exists", "You already sent a request", 409, {
        request: await this.latestRequest(userId),
      });
    }
    return this.latestRequest(userId);
  }

  private async scoresFor(userIds: string[]) {
    if (userIds.length === 0)
      return new Map<
        string,
        Array<{ moduleId: number; title: string; bestScore: number | null }>
      >();
    const modules = await this.conn
      .selectFrom("coach_learning_modules")
      .select(["id", "title"])
      .where("published", "=", true)
      .orderBy("position")
      .orderBy("id")
      .execute();
    const subs = await this.conn
      .selectFrom("coach_learning_submissions")
      .select([
        "user_id",
        "module_id",
        sql<number>`max(correct::float / total)`.as("best"),
      ])
      .where("user_id", "in", userIds as never[])
      .groupBy(["user_id", "module_id"])
      .execute();
    return new Map(
      userIds.map((u) => [
        u,
        modules.map((m) => {
          const s = subs.find((x) => x.user_id === u && x.module_id === m.id);
          return {
            moduleId: m.id,
            title: m.title,
            bestScore: s ? Math.round(s.best * 10000) / 100 : null,
          };
        }),
      ]),
    );
  }

  async openRequests() {
    const rows = await this.conn
      .selectFrom("coach_learning_join_requests as r")
      .innerJoin("user as u", "u.id", "r.user_id")
      .leftJoin("coach_learning_enrolments as e", "e.user_id", "r.user_id")
      .select([
        "r.id",
        "r.user_id",
        "r.note",
        "r.created_at",
        sql<string>`lower(trim(u.email))`.as("email"),
        "u.firstName",
        "u.lastName",
        "e.completed_at",
      ])
      .where("r.status", "=", "open")
      .orderBy("r.created_at")
      .limit(200)
      .execute();
    const scores = await this.scoresFor(rows.map((r) => r.user_id));
    return rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
      email: r.email ?? "",
      note: r.note,
      sentAt: r.created_at.toISOString(),
      completedAt: r.completed_at?.toISOString() ?? null,
      scores: scores.get(r.user_id) ?? [],
    }));
  }

  private async openRequest(id: number) {
    const row = await this.conn
      .selectFrom("coach_learning_join_requests")
      .select(["user_id", "status", "reason"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) throw refuse("unknown-request", "No such request", 404);
    if (row.status !== "open")
      throw refuse("not-open", "That request was already answered", 409, {
        status: row.status,
        reason: row.reason,
      });
    return row;
  }

  private async claim(
    id: number,
    adminId: string,
    status: "approved" | "declined",
    reason: string | null,
  ) {
    const claimed = await this.conn
      .updateTable("coach_learning_join_requests")
      .set({
        status,
        reason,
        answered_at: sql`now()`,
        answered_by: adminId as never,
      })
      .where("id", "=", id)
      .where("status", "=", "open")
      .executeTakeFirst();
    if (!claimed.numUpdatedRows) await this.openRequest(id);
  }

  private settle(id: number, status: "open" | "already-in-program") {
    return this.conn
      .updateTable("coach_learning_join_requests")
      .set(
        status === "open"
          ? { status, answered_at: null, answered_by: null }
          : { status },
      )
      .where("id", "=", id)
      .where("status", "=", "approved")
      .execute();
  }

  async approve(
    adminId: string,
    id: number,
    input: {
      email?: string;
      name?: string;
      group?: string;
      coachName?: string;
    },
    coach: CoachService,
  ) {
    const row = await this.openRequest(id);
    const account = await this.account(row.user_id);
    if (!account.confirmed || !account.email)
      throw refuse(
        "address-unconfirmed",
        "The requester's current address is not confirmed, so no leader was added. They confirm it first.",
      );
    if (input.email && input.email.trim().toLowerCase() !== account.email)
      throw refuse(
        "address-changed",
        `The requester's address changed to ${account.email} since you opened this request, so no leader was added. Review it again.`,
        409,
        { email: account.email },
      );
    await this.claim(id, adminId, "approved", null);
    let added: Awaited<ReturnType<CoachService["addLeader"]>>;
    try {
      added = await coach.addLeader(adminId, {
        email: account.email,
        name: input.name?.trim() || account.name || undefined,
        group: input.group,
        coachName: input.coachName,
      });
    } catch (error) {
      await this.settle(id, "open");
      throw error;
    }
    if (added.ok)
      return { status: "approved" as const, leaderId: added.coach.id };
    if (added.reason === "duplicate") {
      await this.settle(id, "already-in-program");
      return { status: "already-in-program" as const, leaderId: null };
    }
    await this.settle(id, "open");
    throw refuse("add-refused", addRefusalText(added), 409, {
      addRefusal: added.reason,
    });
  }

  async decline(adminId: string, id: number, reason: string) {
    await this.openRequest(id);
    await this.claim(id, adminId, "declined", reason.trim() || null);
    return { status: "declined" as const };
  }

  async learners(input: { q?: string; limit?: number; offset?: number }) {
    const limit = Math.min(input.limit ?? LEARNERS_PAGE, 100);
    const offset = input.offset ?? 0;
    let query = this.conn
      .selectFrom("coach_learning_enrolments as e")
      .innerJoin("user as u", "u.id", "e.user_id");
    const q = input.q?.trim();
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([
          eb("u.email", "ilike", like),
          eb(sql`concat_ws(' ', u."firstName", u."lastName")`, "ilike", like),
        ]),
      );
    }
    const total = (
      await query
        .select(sql<number>`count(*)::int`.as("n"))
        .executeTakeFirstOrThrow()
    ).n;
    const rows = await query
      .select([
        "e.user_id",
        "e.enrolled_at",
        "e.completed_at",
        "u.email",
        "u.firstName",
        "u.lastName",
        sql<number>`(
          SELECT count(DISTINCT s.module_id)::int FROM coach_learning_submissions s
          JOIN coach_learning_modules m ON m.id = s.module_id AND m.published
          WHERE s.user_id = e.user_id AND s.passed
        )`.as("passed"),
        sql<string | null>`(
          SELECT r.status FROM coach_learning_join_requests r
          WHERE r.user_id = e.user_id ORDER BY r.id DESC LIMIT 1
        )`.as("request"),
      ])
      .orderBy("e.enrolled_at", "desc")
      .orderBy("e.user_id")
      .limit(limit)
      .offset(offset)
      .execute();
    const published = (
      await this.conn
        .selectFrom("coach_learning_modules")
        .select(sql<number>`count(*)::int`.as("n"))
        .where("published", "=", true)
        .executeTakeFirstOrThrow()
    ).n;
    return {
      total,
      limit,
      offset,
      learners: rows.map((r) => ({
        name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
        email: r.email ?? "",
        enrolledAt: r.enrolled_at.toISOString(),
        completedAt: r.completed_at?.toISOString() ?? null,
        passed: r.passed,
        total: published,
        request: r.request,
      })),
    };
  }

  async adminTree() {
    const modules = await this.conn
      .selectFrom("coach_learning_modules")
      .select([
        "id",
        "title",
        "description",
        "pass_mark",
        "published",
        "check_version",
      ])
      .orderBy("position")
      .orderBy("id")
      .execute();
    const lessons = await this.conn
      .selectFrom("coach_learning_lessons")
      .select([
        "id",
        "module_id",
        "title",
        "body",
        "passages",
        "published",
        "video_key",
        "video_type",
      ])
      .orderBy("position")
      .orderBy("id")
      .execute();
    const questions = await this.conn
      .selectFrom("coach_learning_questions")
      .select(["id", "module_id", "prompt", "options", "correct"])
      .orderBy("position")
      .orderBy("id")
      .execute();
    const used = await this.conn
      .selectFrom("coach_learning_lesson_completions")
      .select("lesson_id")
      .distinct()
      .execute();
    const submitted = await this.conn
      .selectFrom("coach_learning_submissions")
      .select("module_id")
      .distinct()
      .execute();
    return Promise.all(
      modules.map(async (m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        passMark: m.pass_mark,
        published: m.published,
        checkVersion: m.check_version,
        used: submitted.some((s) => s.module_id === m.id),
        lessons: await Promise.all(
          lessons
            .filter((l) => l.module_id === m.id)
            .map(async (l) => ({
              id: l.id,
              title: l.title,
              body: l.body,
              passages: await describePassages(l.passages),
              published: l.published,
              hasVideo: l.video_key !== null,
              videoType: l.video_type,
              used: used.some((u) => u.lesson_id === l.id),
            })),
        ),
        questions: questions
          .filter((q) => q.module_id === m.id)
          .map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            correct: q.correct,
          })),
      })),
    );
  }

  async previewLesson(lessonId: number) {
    const row = await this.lessonRow(lessonId);
    if (!row) throw refuse("unknown-lesson", "No such lesson", 404);
    return this.lessonView(row, false);
  }

  private async moduleRow(id: number) {
    const row = await this.conn
      .selectFrom("coach_learning_modules")
      .select(["id", "published"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!row) throw refuse("unknown-module", "No such module", 404);
    return row;
  }

  private async lessonOf(id: number) {
    const row = await this.conn
      .selectFrom("coach_learning_lessons as l")
      .innerJoin("coach_learning_modules as m", "m.id", "l.module_id")
      .select([
        "l.id",
        "l.module_id",
        "l.published",
        "l.video_key",
        "m.published as module_published",
      ])
      .where("l.id", "=", id)
      .executeTakeFirst();
    if (!row) throw refuse("unknown-lesson", "No such lesson", 404);
    return row;
  }

  private async publishedLessons(moduleId: number) {
    return (
      await this.conn
        .selectFrom("coach_learning_lessons")
        .select(sql<number>`count(*)::int`.as("n"))
        .where("module_id", "=", moduleId)
        .where("published", "=", true)
        .executeTakeFirstOrThrow()
    ).n;
  }

  private async questionCount(moduleId: number) {
    return (
      await this.conn
        .selectFrom("coach_learning_questions")
        .select(sql<number>`count(*)::int`.as("n"))
        .where("module_id", "=", moduleId)
        .executeTakeFirstOrThrow()
    ).n;
  }

  private nextPosition(table: "coach_learning_modules"): Promise<number>;
  private nextPosition(
    table: "coach_learning_lessons" | "coach_learning_questions",
    moduleId: number,
  ): Promise<number>;
  private async nextPosition(
    table:
      | "coach_learning_modules"
      | "coach_learning_lessons"
      | "coach_learning_questions",
    moduleId?: number,
  ) {
    let q = this.conn
      .selectFrom(table)
      .select(sql<number>`coalesce(max(position), 0)::int + 1`.as("n"));
    if (moduleId !== undefined)
      q = q.where("module_id" as never, "=", moduleId as never);
    return (await q.executeTakeFirstOrThrow()).n;
  }

  async createModule(input: {
    title: string;
    description: string;
    passMark: number;
  }) {
    const title = input.title.trim();
    if (!title) throw refuse("invalid-module", "Give the module a title", 400);
    const row = await this.conn
      .insertInto("coach_learning_modules")
      .values({
        title,
        description: input.description.trim(),
        pass_mark: input.passMark,
        position: await this.nextPosition("coach_learning_modules"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { id: row.id };
  }

  async updateModule(
    id: number,
    input: { title: string; description: string; passMark: number },
  ) {
    await this.moduleRow(id);
    const title = input.title.trim();
    if (!title) throw refuse("invalid-module", "Give the module a title", 400);
    await this.conn
      .updateTable("coach_learning_modules")
      .set({
        title,
        description: input.description.trim(),
        pass_mark: input.passMark,
      })
      .where("id", "=", id)
      .execute();
  }

  async publishModule(id: number, published: boolean) {
    await this.moduleRow(id);
    if (published) {
      const lessons = await this.publishedLessons(id);
      const questions = await this.questionCount(id);
      if (lessons === 0 || questions === 0)
        throw refuse(
          "incomplete-module",
          lessons === 0
            ? "Publish at least one lesson of this module first"
            : "Write at least one check question first",
        );
    }
    await this.conn
      .updateTable("coach_learning_modules")
      .set({ published })
      .where("id", "=", id)
      .execute();
  }

  async deleteModule(id: number) {
    await this.moduleRow(id);
    const lessons = await this.conn
      .selectFrom("coach_learning_lessons")
      .select(["id", "video_key"])
      .where("module_id", "=", id)
      .execute();
    const submitted = await this.conn
      .selectFrom("coach_learning_submissions")
      .select("id")
      .where("module_id", "=", id)
      .executeTakeFirst();
    const done =
      lessons.length > 0
        ? await this.conn
            .selectFrom("coach_learning_lesson_completions")
            .select("lesson_id")
            .where(
              "lesson_id",
              "in",
              lessons.map((l) => l.id),
            )
            .executeTakeFirst()
        : undefined;
    if (submitted || done)
      throw refuse(
        "in-use",
        "Learners have used this module, so it cannot be deleted. Unpublish it instead.",
      );
    await this.conn.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("coach_learning_lessons")
        .where("module_id", "=", id)
        .execute();
      await trx
        .deleteFrom("coach_learning_modules")
        .where("id", "=", id)
        .execute();
    });
    for (const l of lessons) await this.deleteVideos(l.id);
  }

  async reorderModules(ids: number[]) {
    const all = await this.conn
      .selectFrom("coach_learning_modules")
      .select("id")
      .execute();
    await this.reorder("coach_learning_modules", all, ids);
  }

  async reorderLessons(moduleId: number, ids: number[]) {
    await this.moduleRow(moduleId);
    const all = await this.conn
      .selectFrom("coach_learning_lessons")
      .select("id")
      .where("module_id", "=", moduleId)
      .execute();
    await this.reorder("coach_learning_lessons", all, ids);
  }

  async reorderQuestions(moduleId: number, ids: number[]) {
    await this.moduleRow(moduleId);
    const all = await this.conn
      .selectFrom("coach_learning_questions")
      .select("id")
      .where("module_id", "=", moduleId)
      .execute();
    await this.reorder("coach_learning_questions", all, ids);
    await this.bumpCheck(moduleId);
  }

  private async reorder(
    table:
      | "coach_learning_modules"
      | "coach_learning_lessons"
      | "coach_learning_questions",
    all: Array<{ id: number }>,
    ids: number[],
  ) {
    const known = new Set(all.map((r) => r.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    )
      throw refuse("invalid-order", "List every item exactly once", 400);
    await this.conn.transaction().execute(async (trx) => {
      for (const [i, id] of ids.entries())
        await trx
          .updateTable(table)
          .set({ position: i + 1 })
          .where("id", "=", id)
          .execute();
    });
  }

  async createLesson(
    moduleId: number,
    input: { title: string; body: string; passages: Passage[] },
  ) {
    await this.moduleRow(moduleId);
    const title = input.title.trim();
    if (!title) throw refuse("invalid-lesson", "Give the lesson a title", 400);
    const passages = await checkPassages(input.passages);
    const row = await this.conn
      .insertInto("coach_learning_lessons")
      .values({
        module_id: moduleId,
        title,
        body: input.body,
        passages: JSON.stringify(passages),
        position: await this.nextPosition("coach_learning_lessons", moduleId),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { id: row.id };
  }

  async updateLesson(
    id: number,
    input: { title: string; body: string; passages: Passage[] },
  ) {
    await this.lessonOf(id);
    const title = input.title.trim();
    if (!title) throw refuse("invalid-lesson", "Give the lesson a title", 400);
    const passages = await checkPassages(input.passages);
    await this.conn
      .updateTable("coach_learning_lessons")
      .set({ title, body: input.body, passages: JSON.stringify(passages) })
      .where("id", "=", id)
      .execute();
  }

  private async refuseEmptying(moduleId: number) {
    throw refuse(
      "module-would-empty",
      "A published module keeps at least one published lesson and one question. Unpublish the module first.",
      409,
      { moduleId },
    );
  }

  async publishLesson(id: number, published: boolean) {
    const lesson = await this.lessonOf(id);
    if (
      !published &&
      lesson.published &&
      lesson.module_published &&
      (await this.publishedLessons(lesson.module_id)) <= 1
    )
      await this.refuseEmptying(lesson.module_id);
    await this.conn
      .updateTable("coach_learning_lessons")
      .set({ published })
      .where("id", "=", id)
      .execute();
  }

  async deleteLesson(id: number) {
    const lesson = await this.lessonOf(id);
    const done = await this.conn
      .selectFrom("coach_learning_lesson_completions")
      .select("lesson_id")
      .where("lesson_id", "=", id)
      .executeTakeFirst();
    if (done)
      throw refuse(
        "in-use",
        "Learners have marked this lesson done, so it cannot be deleted. Unpublish it instead.",
      );
    if (
      lesson.published &&
      lesson.module_published &&
      (await this.publishedLessons(lesson.module_id)) <= 1
    )
      await this.refuseEmptying(lesson.module_id);
    await this.conn
      .deleteFrom("coach_learning_lessons")
      .where("id", "=", id)
      .execute();
    await this.deleteVideos(id);
  }

  private async deleteVideos(lessonId: number) {
    for (const key of videoSlots(lessonId))
      await this.storage.deleteObject(key);
  }

  private bumpCheck(moduleId: number) {
    return this.conn
      .updateTable("coach_learning_modules")
      .set({ check_version: sql`check_version + 1` })
      .where("id", "=", moduleId)
      .execute();
  }

  async createQuestion(
    moduleId: number,
    input: { prompt: string; options: string[]; correct: number },
  ) {
    await this.moduleRow(moduleId);
    const q = checkQuestion(input);
    const row = await this.conn
      .insertInto("coach_learning_questions")
      .values({
        module_id: moduleId,
        prompt: q.prompt,
        options: q.options,
        correct: q.correct,
        position: await this.nextPosition("coach_learning_questions", moduleId),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await this.bumpCheck(moduleId);
    return { id: row.id };
  }

  private async questionRow(id: number) {
    const row = await this.conn
      .selectFrom("coach_learning_questions as q")
      .innerJoin("coach_learning_modules as m", "m.id", "q.module_id")
      .select(["q.id", "q.module_id", "m.published"])
      .where("q.id", "=", id)
      .executeTakeFirst();
    if (!row) throw refuse("unknown-question", "No such question", 404);
    return row;
  }

  async updateQuestion(
    id: number,
    input: { prompt: string; options: string[]; correct: number },
  ) {
    const row = await this.questionRow(id);
    const q = checkQuestion(input);
    await this.conn
      .updateTable("coach_learning_questions")
      .set({ prompt: q.prompt, options: q.options, correct: q.correct })
      .where("id", "=", id)
      .execute();
    await this.bumpCheck(row.module_id);
  }

  async deleteQuestion(id: number) {
    const row = await this.questionRow(id);
    if (row.published && (await this.questionCount(row.module_id)) <= 1)
      await this.refuseEmptying(row.module_id);
    await this.conn
      .deleteFrom("coach_learning_questions")
      .where("id", "=", id)
      .execute();
    await this.bumpCheck(row.module_id);
  }

  async videoUploadUrl(
    lessonId: number,
    input: { size: number; type: string },
  ) {
    const lesson = await this.lessonOf(lessonId);
    if (!VIDEO_TYPES.includes(input.type as VideoType))
      throw refuse("video-refused", "Upload an MP4 or WebM video", 400);
    if (input.size > VIDEO_MAX_BYTES)
      throw refuse("video-refused", "A lesson video is at most 2 GB", 400);
    const key = videoSlot(lessonId, lesson.video_key);
    return {
      uploadUrl: await this.storage.getGlobalObjectUploadUrl({
        key,
        expiresInSeconds: VIDEO_UPLOAD_URL_SECONDS,
        contentLength: input.size,
      }),
    };
  }

  async attachVideo(lessonId: number) {
    const lesson = await this.lessonOf(lessonId);
    const key = videoSlot(lessonId, lesson.video_key);
    const size = await this.storage.objectSize(key);
    if (size === null)
      throw refuse(
        "no-upload",
        "The upload did not finish. The lesson keeps its previous video.",
      );
    const type =
      size <= VIDEO_MAX_BYTES
        ? videoTypeOf(await this.storage.getGlobalObjectRange(key, 0, 11))
        : null;
    if (!type) {
      await this.storage.deleteObject(key);
      throw refuse(
        "video-refused",
        size > VIDEO_MAX_BYTES
          ? "A lesson video is at most 2 GB"
          : "That file is not an MP4 or WebM video",
        400,
      );
    }
    await this.conn
      .updateTable("coach_learning_lessons")
      .set({ video_key: key, video_type: type })
      .where("id", "=", lessonId)
      .execute();
    if (lesson.video_key) await this.storage.deleteObject(lesson.video_key);
    return { type };
  }

  async removeVideo(lessonId: number) {
    await this.lessonOf(lessonId);
    await this.conn
      .updateTable("coach_learning_lessons")
      .set({ video_key: null, video_type: null })
      .where("id", "=", lessonId)
      .execute();
    await this.deleteVideos(lessonId);
  }
}

function addRefusalText(
  added: Exclude<Awaited<ReturnType<CoachService["addLeader"]>>, { ok: true }>,
): string {
  const words = COACH_REFUSALS["POST /coach/admin/leaders"];
  switch (added.reason) {
    case "slug-taken":
      return words["slug-taken"].message.replace("<slug>", added.slug);
    case "keyword-conflict":
      return `Name refused: ${added.conflicts
        .map((c) => `it contains "${c.keyword}", a keyword of ${c.leader}`)
        .join(
          "; ",
        )}. Their sessions would be routed to that leader. Enter a different name.`;
    default:
      return words[added.reason === "duplicate" ? "email-taken" : added.reason]
        .message;
  }
}
