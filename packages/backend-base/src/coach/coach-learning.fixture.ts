import { jwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";
import { sql } from "kysely";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import {
  CoachLearningService,
  type LearningStorage,
} from "./coach-learning.service";
import coachPlugin from "./coach.plugin";
import { CoachService } from "./coach.service";

export const conn = Database.getOrCreateConnection();

export class MemoryVideos implements LearningStorage {
  objects = new Map<string, Uint8Array>();
  sizes = new Map<string, number>();
  signed: Array<{ key: string; contentLength?: number }> = [];
  async getGlobalObjectUploadUrl(input: {
    key: string;
    expiresInSeconds: number;
    contentLength?: number;
  }) {
    this.signed.push(input);
    return `https://store.example.test/${input.key}?put`;
  }
  async getGlobalObjectUrl(input: { key: string; expiresInSeconds?: number }) {
    return `https://store.example.test/${input.key}?get&ttl=${input.expiresInSeconds}`;
  }
  async getGlobalObjectRange(key: string, start: number, end?: number) {
    return (
      this.objects
        .get(key)
        ?.slice(start, (end ?? Number.POSITIVE_INFINITY) + 1) ?? null
    );
  }
  async objectSize(key: string) {
    if (!this.objects.has(key)) return null;
    return this.sizes.get(key) ?? this.objects.get(key)?.byteLength ?? null;
  }
  async deleteObject(key: string) {
    this.sizes.delete(key);
    return this.objects.delete(key);
  }
}

export const MP4 = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 1, 2,
]);
export const WEBM = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8,
]);

export class FakeMailer {
  sent: string[] = [];
  async sendEmail(data: { to: { email: string } }) {
    this.sent.push(data.to.email);
    return { delivered: true };
  }
}

export const LEARNING_TABLES = [
  "coach_learning_join_requests",
  "coach_learning_submissions",
  "coach_learning_lesson_completions",
  "coach_learning_enrolments",
  "coach_learning_questions",
  "coach_learning_lessons",
  "coach_learning_modules",
] as const;

export async function clearLearning() {
  for (const table of LEARNING_TABLES) await conn.deleteFrom(table).execute();
}

export function learningApp() {
  const app = new Elysia().use(coachPlugin);
  const store = app.store as unknown as {
    coachService: CoachService;
    learningService: CoachLearningService;
  };
  const videos = new MemoryVideos();
  const mailer = new FakeMailer();
  const original = {
    coach: store.coachService,
    learning: store.learningService,
  };
  store.coachService = new CoachService(Database, mailer as never);
  store.learningService = new CoachLearningService(Database, videos);
  const restore = () => {
    store.coachService = original.coach;
    store.learningService = original.learning;
  };
  return { app, videos, mailer, restore };
}

const signer = new Elysia().use(
  jwt({ name: "jwt", secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string }),
);

export interface Account {
  id: string;
  email: string;
  token: string;
}

export async function account(
  email: string,
  options: { confirmed?: boolean; firstName?: string; lastName?: string } = {},
): Promise<Account> {
  await conn.deleteFrom("user").where("email", "=", email).execute();
  const confirmed = options.confirmed ?? true;
  const id = (
    await conn
      .insertInto("user")
      .values({
        email,
        firstName: options.firstName ?? "Test",
        lastName: options.lastName ?? "Learner",
        emailVerified: confirmed,
        ...(confirmed ? { email_verified_at: sql`now()` } : {}),
      } as never)
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string;
  const token = await signer.decorator.jwt.sign({ sub: id });
  await redisClient.set(cacheConstants.accessToken(id), [token], "10m");
  await redisClient.delete(`rate-limit:coach-learning:${id}`);
  await redisClient.delete(`rate-limit:coach:${id}`);
  return { id, email, token };
}

export async function resetLimits(...who: Account[]) {
  for (const a of who) {
    await redisClient.delete(`rate-limit:coach-learning:${a.id}`);
    await redisClient.delete(`rate-limit:coach-learning-check:${a.id}`);
  }
}

export async function dropAccounts(emails: string[]) {
  const rows = await conn
    .selectFrom("user")
    .select("id")
    .where("email", "in", emails)
    .execute();
  for (const r of rows)
    await redisClient.set(cacheConstants.accessToken(r.id as string), [], "1s");
  if (rows.length)
    await conn.deleteFrom("user").where("email", "in", emails).execute();
}

export async function makeAdmin(who: Account) {
  await conn
    .deleteFrom("coach_admins")
    .where("email", "=", who.email)
    .execute();
  await conn
    .insertInto("coach_admins")
    .values({ email: who.email, user_id: who.id as never })
    .execute();
}

export function caller(app: { handle(request: Request): Promise<Response> }) {
  return async (
    who: Account | null,
    method: string,
    path: string,
    body?: unknown,
  ) => {
    const res = await app.handle(
      new Request(`http://localhost/coach/${path}`, {
        method,
        headers: {
          ...(who ? { authorization: `Bearer ${who.token}` } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    const text = await res.text();
    return {
      status: res.status,
      body: text ? (JSON.parse(text) as Record<string, any>) : null,
      raw: text,
    };
  };
}
