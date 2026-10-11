import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import cacheConstants from "../../shared/cache.constants";
import shared from "../../shared/shared.plugin";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import {
  audioGenerationJobId,
  audioGenerationQueue,
} from "./audio-generation.queue";
import plugin, { SYNTHESIS_LIMIT } from "./audio.plugin";
import { MAX_EXPLANATION_ID as MAX_ID } from "./audio.service";

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

const PER_CALLER = SYNTHESIS_LIMIT.perCaller;
const OVERALL_KEY = `rate-limit:${SYNTHESIS_LIMIT.overallKey}`;
const DEFAULT_VOICE = process.env.TTS_VOICE_EN ?? "alloy";
const OFFERED_LANGUAGE = "qz";

const conn = shared.store.db.getOrCreateConnection();
const cache = shared.store.cache;
const storage = new ObjectStorageService();

const explanationIds: number[] = [];
const userIds: string[] = [];
const rateLimitKeys: string[] = [];

let insertedLanguage = false;
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

async function explanation(chapter: number, is_active = true) {
  const { explanation_id } = await conn
    .insertInto("explanations")
    .values({
      type: ExplanationTypeEnum.summary,
      explanation: faker.lorem.sentence(),
      chapter_id: chapter,
      version: nextVersion++,
      is_active,
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
  expect((plugin.store as any).audioService.provider.name).toBe("stub");
  genesis1ChapterId = await chapterId(1, 1);
  genesis2ChapterId = await chapterId(1, 2);
  const inserted = await conn
    .insertInto("explanation_languages")
    .values({
      language_code: OFFERED_LANGUAGE,
      name: "Offered",
      native_name: "Offered",
      explanation_count: 1,
      is_enabled: true,
    })
    .onConflict((oc) => oc.column("language_code").doNothing())
    .returning("language_code")
    .execute();
  insertedLanguage = inserted.length > 0;
});

beforeEach(async () => {
  await cache.delete(OVERALL_KEY);
});

afterAll(async () => {
  restoreEnv();
  await cache.delete(OVERALL_KEY);
  if (insertedLanguage) {
    await conn
      .deleteFrom("explanation_languages")
      .where("language_code", "=", OFFERED_LANGUAGE)
      .execute();
  }
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

  it("serves an enabled language that has no explanations yet", async () => {
    const id = await explanation(genesis1ChapterId);
    const { explanation_count: originalCount } = await conn
      .selectFrom("explanation_languages")
      .select("explanation_count")
      .where("language_code", "=", OFFERED_LANGUAGE)
      .executeTakeFirstOrThrow();
    await conn
      .updateTable("explanation_languages")
      .set({ explanation_count: 0 })
      .where("language_code", "=", OFFERED_LANGUAGE)
      .execute();
    try {
      const response = await getAudio(id, {
        query: { language: OFFERED_LANGUAGE },
        headers: { "x-forwarded-for": guestAddress() },
      });
      expect(response.status).toBe(200);
      expect((await response.json()).audio.language_code).toBe("en");
    } finally {
      await conn
        .updateTable("explanation_languages")
        .set({ explanation_count: originalCount })
        .where("language_code", "=", OFFERED_LANGUAGE)
        .execute();
    }
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

describe("GET /bible/explanation/audio/:explanationId replaced versions", () => {
  it("answers 404 without spending a slot when a replaced version has no audio", async () => {
    const ip = guestAddress();
    const id = await explanation(genesis1ChapterId, false);
    const response = await getAudio(id, { headers: { "x-forwarded-for": ip } });
    expect(response.status).toBe(404);
    expect(await storedVariants(id)).toHaveLength(0);
    expect(await cache.ttl(`rate-limit:audio-synthesis:ip:${ip}`)).toBeLessThan(
      0,
    );
    expect(await cache.ttl(OVERALL_KEY)).toBeLessThan(0);
  });

  it("serves the audio a replaced version already has, even when marked stale", async () => {
    const ip = guestAddress();
    const id = await explanation(genesis1ChapterId);
    expect(
      (await getAudio(id, { headers: { "x-forwarded-for": ip } })).status,
    ).toBe(200);
    await conn
      .updateTable("explanations")
      .set({ is_active: false })
      .where("explanation_id", "=", id)
      .execute();
    await conn
      .updateTable("explanation_audios")
      .set({ is_stale: true })
      .where("explanation_id", "=", id)
      .execute();
    await cache.delete(OVERALL_KEY);

    const response = await getAudio(id, { headers: { "x-forwarded-for": ip } });
    expect(response.status).toBe(200);
    const [stored] = await storedVariants(id);
    expect((await response.json()).audio.url).toContain(stored.storage_key);
    expect(await storedVariants(id)).toHaveLength(1);
    expect(await cache.ttl(OVERALL_KEY)).toBeLessThan(0);
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

  it("answers 404 for a malformed job id without echoing it", async () => {
    const jobId = "bull:audio-generation:1";
    const response = await getJob(jobId);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(jobId);
  });

  it("answers 404 to a guest for a job id beyond the id range", async () => {
    const response = await getJob(`audio-gen:99999999999:${DEFAULT_VOICE}:en`);
    expect(response.status).toBe(404);
  });

  it("reports a queued job to a guest inside the guest scope", async () => {
    const id = await explanation(genesis1ChapterId);
    const data = {
      explanation_id: id,
      voice: DEFAULT_VOICE,
      language_code: "en",
    };
    const jobId = audioGenerationJobId(data);
    const job = await audioGenerationQueue.add("audio-generation", data, {
      jobId,
      delay: 600_000,
    });
    try {
      const response = await getJob(jobId);
      expect(response.status).toBe(200);
      expect((await response.json()).job).toEqual({
        job_id: jobId,
        status: "queued",
      });
    } finally {
      await job.remove();
    }
  });
});

describe("explanation id range", () => {
  it.each(["99999999999", "2147483648", "0", "1.5"])(
    "refuses the explanation id %p before any lookup",
    async (explanationId) => {
      const user = await signedInUser();
      const auth = { authorization: `Bearer ${user.token}` };
      const base = `http://localhost/bible/explanation/audio/${explanationId}`;
      const responses = await Promise.all([
        plugin.handle(
          new Request(base, { headers: { "x-forwarded-for": guestAddress() } }),
        ),
        plugin.handle(new Request(`${base}/progress`, { headers: auth })),
        plugin.handle(
          new Request(`${base}/progress`, {
            method: "POST",
            headers: { ...auth, "content-type": "application/json" },
            body: JSON.stringify({
              position_seconds: 1,
              duration_seconds: 10,
              reason: "pause",
            }),
          }),
        ),
        plugin.handle(
          new Request(`${base}/progress`, { method: "DELETE", headers: auth }),
        ),
      ]);
      expect(responses.map((r) => r.status)).toEqual([422, 422, 422, 422]);
    },
  );

  it("looks up the largest explanation id instead of refusing it", async () => {
    const response = await getAudio(MAX_ID, {
      headers: { "x-forwarded-for": guestAddress() },
    });
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

    for (let attempt = 2; attempt <= PER_CALLER; attempt++) {
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
      Array.from({ length: PER_CALLER + 10 }, () =>
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
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([
      ...Array(PER_CALLER).fill(200),
      ...Array(10).fill(429),
    ]);
    const stored = await conn
      .selectFrom("explanation_audios")
      .select("explanation_id")
      .where("explanation_id", "in", ids)
      .execute();
    expect(stored).toHaveLength(PER_CALLER);

    const guest = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect(guest.status).toBe(200);
  }, 30_000);

  it.each([
    ["a language nobody offers", 400, { language: "zz-ZZ" }, 1],
    ["a voice nobody offers", 400, { voice: "nova-x" }, 1],
    ["a chapter outside the guest scope", 401, {}, 2],
    ["an explanation that does not exist", 404, {}, 0],
  ] as const)(
    "does not spend a slot on %s",
    async (_case, status, query, chapterNumber) => {
      const ip = guestAddress();
      const id =
        chapterNumber === 0
          ? MAX_ID
          : await explanation(
              chapterNumber === 1 ? genesis1ChapterId : genesis2ChapterId,
            );
      const refused = await getAudio(id, {
        query: { ...query },
        headers: { "x-forwarded-for": ip },
      });
      expect(refused.status).toBe(status);
      expect(
        await cache.ttl(`rate-limit:audio-synthesis:ip:${ip}`),
      ).toBeLessThan(0);
      expect(await cache.ttl(OVERALL_KEY)).toBeLessThan(0);
    },
  );

  it("keys a guest on the address the trusted proxy appended", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    try {
      const proxied = faker.internet.ipv4();
      rateLimitKeys.push(`rate-limit:audio-synthesis:ip:${proxied}`);
      const forged = () => `${faker.internet.ipv4()}, ${proxied}`;
      const statuses = [];
      for (let i = 0; i < 2; i++) {
        const response = await getAudio(await explanation(genesis1ChapterId), {
          headers: { "x-forwarded-for": forged() },
        });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([200, 200]);
      const counted = await cache.get<number>(
        `rate-limit:audio-synthesis:ip:${proxied}`,
      );
      expect(Number(counted)).toBe(2);
    } finally {
      Reflect.deleteProperty(process.env, "TRUSTED_PROXY_HOPS");
    }
  });
});

describe("GET /bible/explanation/audio/:explanationId overall synthesis limit", () => {
  it("stops new synthesis for every caller once the overall limit is spent and keeps cached audio", async () => {
    const ip = guestAddress();
    const cachedId = await explanation(genesis1ChapterId);
    expect(
      (await getAudio(cachedId, { headers: { "x-forwarded-for": ip } })).status,
    ).toBe(200);

    let spent = 1;
    while (spent < SYNTHESIS_LIMIT.overall) {
      spent = await cache.increment(OVERALL_KEY, SYNTHESIS_LIMIT.windowSeconds);
    }

    const user = await signedInUser();
    const fresh = await explanation(genesis2ChapterId);
    const limitedUser = await getAudio(fresh, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    const limitedGuest = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": guestAddress() },
    });
    expect([limitedUser.status, limitedGuest.status]).toEqual([429, 429]);
    expect(await storedVariants(fresh)).toHaveLength(0);

    const cached = await getAudio(cachedId, {
      headers: { "x-forwarded-for": ip },
    });
    expect(cached.status).toBe(200);
  });

  it("does not spend the overall limit on a caller already over its own", async () => {
    const ip = guestAddress();
    await cache.delete(`rate-limit:audio-synthesis:ip:${ip}`);
    for (let i = 0; i < PER_CALLER; i++) {
      await cache.increment(
        `rate-limit:audio-synthesis:ip:${ip}`,
        SYNTHESIS_LIMIT.windowSeconds,
      );
    }
    const response = await getAudio(await explanation(genesis1ChapterId), {
      headers: { "x-forwarded-for": ip },
    });
    expect(response.status).toBe(429);
    expect(await cache.get<number>(OVERALL_KEY)).toBeNull();
  });
});

describe("same variant requested in parallel", () => {
  it("stores one row and answers every request", async () => {
    const id = await explanation(genesis1ChapterId);
    const responses = await Promise.all(
      [undefined, "en", OFFERED_LANGUAGE, "en", undefined].map((language) =>
        getAudio(id, {
          query: language ? { language } : {},
          headers: { "x-forwarded-for": guestAddress() },
        }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const stored = await storedVariants(id);
    expect(stored).toHaveLength(1);
    expect(stored[0].language_code).toBe("en");
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

  it("treats a reader with the token only in the query string as a guest", async () => {
    const user = await signedInUser();
    const id = await explanation(genesis2ChapterId);

    for (const name of ["accessToken", "access_token"]) {
      const viaQuery = await getAudio(id, {
        query: { [name]: user.token },
        headers: { "x-forwarded-for": guestAddress() },
      });
      expect(viaQuery.status).toBe(401);
    }
    expect(await storedVariants(id)).toHaveLength(0);

    const viaHeader = await getAudio(id, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(viaHeader.status).toBe(200);
  });
});
