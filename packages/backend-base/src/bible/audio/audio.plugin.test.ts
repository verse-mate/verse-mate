import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import cacheConstants from "../../shared/cache.constants";
import shared from "../../shared/shared.plugin";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import plugin from "./audio.plugin";

process.env.TTS_PROVIDER = "stub";
process.env.EXPLANATION_AUDIO_STUB_PATH = resolve(
  import.meta.dir,
  "../../../../../apps/backend/fixtures/explanation-audio-stub.mp3",
);

const conn = shared.store.db.getOrCreateConnection();
const cache = shared.store.cache;
const storage = new ObjectStorageService();

const explanationIds: number[] = [];
const userIds: string[] = [];
const rateLimitKeys: string[] = [];

let nextVersion = faker.number.int({ min: 100_000, max: 900_000 });
let genesis1ChapterId: number;
let genesis2ChapterId: number;

async function chapterId(bookId: number, chapterNumber: number) {
  const chapter = await conn
    .selectFrom("chapters")
    .select("chapter_id")
    .where("book_id", "=", bookId)
    .where("chapter_number", "=", chapterNumber)
    .executeTakeFirstOrThrow();
  return chapter.chapter_id;
}

async function explanation(chapter: number) {
  const { explanation_id } = await conn
    .insertInto("explanations")
    .values({
      type: ExplanationTypeEnum.summary,
      explanation: faker.lorem.sentence(),
      chapter_id: chapter,
      version: nextVersion++,
      is_active: false,
      created_by_admin: true,
      parent_explanation_id: null,
      language_code: "en",
    })
    .returning("explanation_id")
    .executeTakeFirstOrThrow();
  explanationIds.push(explanation_id);
  return explanation_id;
}

async function signedInUser() {
  const { id } = await conn
    .insertInto("user")
    .values({
      email: `audio-${faker.string.uuid()}@example.test`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      emailVerified: true,
      password: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  userIds.push(id);
  const token = await (shared as any).decorator.jwt.sign({ sub: id });
  await cache.set(cacheConstants.accessToken(id), [token], "15m");
  rateLimitKeys.push(`rate-limit:audio-synthesis:user:${id}`);
  return { id, token };
}

function guestAddress() {
  const ip = faker.internet.ipv4();
  rateLimitKeys.push(`rate-limit:audio-synthesis:ip:${ip}`);
  return ip;
}

function getAudio(
  explanationId: number,
  options: {
    query?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
) {
  const qs = new URLSearchParams(options.query ?? {}).toString();
  return plugin.handle(
    new Request(
      `http://localhost/bible/explanation/audio/${explanationId}${qs ? `?${qs}` : ""}`,
      { headers: options.headers },
    ),
  );
}

async function storedVariants(explanationId: number) {
  return conn
    .selectFrom("explanation_audios")
    .select(["voice", "language_code", "storage_key"])
    .where("explanation_id", "=", explanationId)
    .execute();
}

beforeAll(async () => {
  genesis1ChapterId = await chapterId(1, 1);
  genesis2ChapterId = await chapterId(1, 2);
});

afterAll(async () => {
  if (explanationIds.length > 0) {
    await conn
      .deleteFrom("explanation_audio_progress")
      .where("explanation_id", "in", explanationIds)
      .execute();
    const rows = await conn
      .selectFrom("explanation_audios")
      .select("storage_key")
      .where("explanation_id", "in", explanationIds)
      .execute();
    await Promise.all(rows.map((r) => storage.deleteObject(r.storage_key)));
    await conn
      .deleteFrom("explanation_audios")
      .where("explanation_id", "in", explanationIds)
      .execute();
    await conn
      .deleteFrom("explanations")
      .where("explanation_id", "in", explanationIds)
      .execute();
  }
  for (const id of userIds) {
    await cache.delete(cacheConstants.accessToken(id));
    await conn.deleteFrom("user").where("id", "=", id).execute();
  }
  for (const key of rateLimitKeys) {
    await cache.delete(key);
  }
});

describe("GET /bible/explanation/audio/:explanationId query values", () => {
  it("answers 400 for a language the product does not offer and synthesizes nothing", async () => {
    const id = await explanation(genesis1ChapterId);
    const response = await getAudio(id, {
      query: { language: "zz-ZZ" },
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(response.status).toBe(400);
    expect(await storedVariants(id)).toHaveLength(0);
  });

  it("answers 400 for a language carrying path segments", async () => {
    const id = await explanation(genesis1ChapterId);
    const response = await getAudio(id, {
      query: { language: "en/../../other" },
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(response.status).toBe(400);
    expect(await storedVariants(id)).toHaveLength(0);
  });

  it("answers 400 for a voice the product does not offer", async () => {
    const id = await explanation(genesis1ChapterId);
    const response = await getAudio(id, {
      query: { voice: faker.string.alpha(12) },
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(response.status).toBe(400);
    expect(await storedVariants(id)).toHaveLength(0);
  });

  it("serves the explanation's language and its regional form", async () => {
    const id = await explanation(genesis1ChapterId);
    const ip = guestAddress();
    const base = await getAudio(id, {
      query: { language: "en" },
      headers: { "x-forwarded-for": ip },
    });
    const regional = await getAudio(id, {
      query: { language: "en-US" },
      headers: { "x-forwarded-for": ip },
    });
    expect(base.status).toBe(200);
    expect(regional.status).toBe(200);
    const variants = await storedVariants(id);
    expect(variants.map((v) => v.language_code).sort()).toEqual([
      "en",
      "en-US",
    ]);
  });
});

describe("GET /bible/explanation/audio/:explanationId synthesis limit", () => {
  it("limits new synthesis per guest address and keeps cached audio available", async () => {
    const ip = guestAddress();
    const first = await explanation(genesis1ChapterId);
    expect(
      (await getAudio(first, { headers: { "x-forwarded-for": ip } })).status,
    ).toBe(200);

    let limitedAt = 0;
    for (let attempt = 2; attempt <= 100; attempt++) {
      const id = await explanation(genesis1ChapterId);
      const response = await getAudio(id, {
        headers: { "x-forwarded-for": ip },
      });
      if (response.status === 429) {
        limitedAt = attempt;
        expect(await storedVariants(id)).toHaveLength(0);
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limitedAt).toBeGreaterThan(1);

    const cached = await getAudio(first, {
      headers: { "x-forwarded-for": ip },
    });
    expect(cached.status).toBe(200);

    const otherGuest = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(otherGuest.status).toBe(200);
  });

  it("counts a signed-in reader by account, not by address", async () => {
    const user = await signedInUser();
    let limitedAt = 0;
    for (let attempt = 1; attempt <= 100; attempt++) {
      const id = await explanation(genesis2ChapterId);
      const response = await getAudio(id, {
        headers: {
          authorization: `Bearer ${user.token}`,
          "x-forwarded-for": guestAddress(),
        },
      });
      if (response.status === 429) {
        limitedAt = attempt;
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limitedAt).toBeGreaterThan(1);

    const guest = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(guest.status).toBe(200);
  });
});

describe("access token transport", () => {
  function saveProgress(
    explanationId: number,
    options: { query?: string; headers?: Record<string, string> },
  ) {
    return plugin.handle(
      new Request(
        `http://localhost/bible/explanation/audio/${explanationId}/progress${options.query ?? ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...options.headers },
          body: JSON.stringify({
            position_seconds: 60,
            duration_seconds: 600,
            reason: "pause",
          }),
        },
      ),
    );
  }

  async function savedProgress(userId: string, explanationId: number) {
    return conn
      .selectFrom("explanation_audio_progress")
      .select("position_seconds")
      .where("user_id", "=", userId)
      .where("explanation_id", "=", explanationId)
      .execute();
  }

  it("ignores access tokens sent in the query string", async () => {
    const user = await signedInUser();
    const id = await explanation(genesis1ChapterId);

    for (const name of ["accessToken", "access_token"]) {
      const viaQuery = await saveProgress(id, {
        query: `?${name}=${encodeURIComponent(user.token)}`,
      });
      expect(viaQuery.status).toBe(204);
      expect(await savedProgress(user.id, id)).toHaveLength(0);
    }

    const viaHeader = await saveProgress(id, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(viaHeader.status).toBe(200);
    expect(await savedProgress(user.id, id)).toHaveLength(1);
  });
});
