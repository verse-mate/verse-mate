import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import cacheConstants from "../../shared/cache.constants";
import shared from "../../shared/shared.plugin";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import plugin from "./audio.plugin";

const previousEnv = {
  TTS_PROVIDER: process.env.TTS_PROVIDER,
  EXPLANATION_AUDIO_STUB_PATH: process.env.EXPLANATION_AUDIO_STUB_PATH,
  TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
};
process.env.TTS_PROVIDER = "stub";
process.env.EXPLANATION_AUDIO_STUB_PATH = resolve(
  import.meta.dir,
  "../../../../../apps/backend/fixtures/explanation-audio-stub.mp3",
);
Reflect.deleteProperty(process.env, "TRUSTED_PROXY_HOPS");

const SYNTHESIS_LIMIT = 30;
const DEFAULT_VOICE = process.env.TTS_VOICE_EN ?? "alloy";
const OFFERED_LANGUAGE = "qz";

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

function restoreEnv() {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
  }
}

beforeAll(async () => {
  genesis1ChapterId = await chapterId(1, 1);
  genesis2ChapterId = await chapterId(1, 2);
  await conn
    .insertInto("explanation_languages")
    .values({
      language_code: OFFERED_LANGUAGE,
      name: "Offered",
      native_name: "Offered",
      explanation_count: 1,
      is_enabled: true,
    })
    .execute();
  expect((plugin.store as any).audioService.provider.name).toBe("stub");
});

afterAll(async () => {
  restoreEnv();
  await conn
    .deleteFrom("explanation_languages")
    .where("language_code", "=", OFFERED_LANGUAGE)
    .execute();
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

describe("GET /bible/explanation/audio/:explanationId offered languages", () => {
  it("serves the explanation's own audio for another offered language", async () => {
    const id = await explanation(genesis1ChapterId);
    const ip = guestAddress();
    const response = await getAudio(id, {
      query: { language: OFFERED_LANGUAGE },
      headers: { "x-forwarded-for": ip },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).audio.language_code).toBe("en");
    const again = await getAudio(id, { headers: { "x-forwarded-for": ip } });
    expect(again.status).toBe(200);
    expect(await storedVariants(id)).toHaveLength(1);
  });

  it("refuses an offered language once it is disabled", async () => {
    const id = await explanation(genesis1ChapterId);
    await conn
      .updateTable("explanation_languages")
      .set({ is_enabled: false })
      .where("language_code", "=", OFFERED_LANGUAGE)
      .execute();
    try {
      const response = await getAudio(id, {
        query: { language: OFFERED_LANGUAGE },
        headers: { "x-forwarded-for": guestAddress() },
      });
      expect(response.status).toBe(400);
    } finally {
      await conn
        .updateTable("explanation_languages")
        .set({ is_enabled: true })
        .where("language_code", "=", OFFERED_LANGUAGE)
        .execute();
    }
  });
});

describe("GET /bible/explanation/audio/jobs/:jobId", () => {
  function getJob(jobId: string, headers: Record<string, string> = {}) {
    return plugin.handle(
      new Request(
        `http://localhost/bible/explanation/audio/jobs/${encodeURIComponent(jobId)}`,
        { headers },
      ),
    );
  }

  it("refuses a guest the job of a chapter outside the guest scope", async () => {
    const id = await explanation(genesis2ChapterId);
    const response = await getJob(`audio-gen:${id}:${DEFAULT_VOICE}:en`);
    expect(response.status).toBe(401);
  });

  it("looks the job up for a signed-in reader", async () => {
    const user = await signedInUser();
    const id = await explanation(genesis2ChapterId);
    const response = await getJob(`audio-gen:${id}:${DEFAULT_VOICE}:en`, {
      authorization: `Bearer ${user.token}`,
    });
    expect(response.status).toBe(404);
  });

  it("answers 404 for a malformed job id", async () => {
    const response = await getJob("bull:audio-generation:1");
    expect(response.status).toBe(404);
  });
});

describe("GET /bible/explanation/audio/:explanationId synthesis limit", () => {
  it("limits new synthesis per guest address and keeps cached audio available", async () => {
    const ip = guestAddress();
    const first = await explanation(genesis1ChapterId);
    expect(
      (await getAudio(first, { headers: { "x-forwarded-for": ip } })).status,
    ).toBe(200);

    for (let attempt = 2; attempt <= SYNTHESIS_LIMIT; attempt++) {
      const response = await getAudio(await explanation(genesis1ChapterId), {
        headers: { "x-forwarded-for": ip },
      });
      expect(response.status).toBe(200);
    }

    const over = await explanation(genesis1ChapterId);
    const limited = await getAudio(over, {
      headers: { "x-forwarded-for": ip },
    });
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(body.retryAfter).toBeLessThanOrEqual(600);
    expect(await storedVariants(over)).toHaveLength(0);

    const cached = await getAudio(first, {
      headers: { "x-forwarded-for": ip },
    });
    expect(cached.status).toBe(200);

    const otherGuest = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(otherGuest.status).toBe(200);
  }, 30_000);

  it("holds the limit for a signed-in reader under parallel misses from many addresses", async () => {
    const user = await signedInUser();
    const ids = await Promise.all(
      Array.from({ length: SYNTHESIS_LIMIT + 10 }, () =>
        explanation(genesis2ChapterId),
      ),
    );
    const responses = await Promise.all(
      ids.map((id) =>
        getAudio(id, {
          headers: {
            authorization: `Bearer ${user.token}`,
            "x-forwarded-for": guestAddress(),
          },
        }),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(SYNTHESIS_LIMIT);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);

    const guest = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(guest.status).toBe(200);
  }, 30_000);

  it("does not spend a slot on a refused language", async () => {
    const ip = guestAddress();
    const id = await explanation(genesis1ChapterId);
    await getAudio(id, {
      query: { language: "zz-ZZ" },
      headers: { "x-forwarded-for": ip },
    });
    expect(await cache.ttl(`rate-limit:audio-synthesis:ip:${ip}`)).toBeLessThan(
      0,
    );
  });

  it("keys a guest on the address the trusted proxy appended", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    try {
      const proxied = faker.internet.ipv4();
      rateLimitKeys.push(`rate-limit:audio-synthesis:ip:${proxied}`);
      const forged = () => `${faker.internet.ipv4()}, ${proxied}`;
      await getAudio(await explanation(genesis1ChapterId), {
        headers: { "x-forwarded-for": forged() },
      });
      await getAudio(await explanation(genesis1ChapterId), {
        headers: { "x-forwarded-for": forged() },
      });
      const counted = await cache.get<number>(
        `rate-limit:audio-synthesis:ip:${proxied}`,
      );
      expect(Number(counted)).toBe(2);
    } finally {
      Reflect.deleteProperty(process.env, "TRUSTED_PROXY_HOPS");
    }
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
