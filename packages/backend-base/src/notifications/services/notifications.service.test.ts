/**
 * GH-281 unit tests — NotificationsService with fake repo + push client +
 * daily-verse provider (no DB, no Expo). Covers:
 *   - daily send: one push per token, personalized per-user version, skip empty
 *   - idempotency (D-11): only not-notified tokens; markNotified after OK; a
 *     second same-day run sends nothing; a chunk throw never fails the job
 *   - DeviceNotRegistered → prune (soft-delete) and NOT marked notified
 *   - broadcast (D-14): fan-out, versemate:// validation, audit row + count
 *   - pure payload builders (title/body truncation/deep link)
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { ValidationError } from "../../common/errors";
import type {
  PushClient,
  PushMessage,
  PushSendResult,
} from "../../shared/notification/push-client";
import type {
  ActiveToken,
  BroadcastAuditInput,
  TokenToNotify,
} from "../repository/notifications.repository";
import { NotificationsRepository } from "../repository/notifications.repository";
import {
  NotificationsService,
  buildVerseDeepLink,
  buildVerseNotification,
  truncateBody,
  verseNotificationTitle,
} from "./notifications.service";

type Verse = Awaited<
  ReturnType<
    import("../../daily-verse/services/daily-verse.service").DailyVerseService["getVerseOfTheDay"]
  >
>;

function makeVerse(overrides: Partial<Extract<Verse, { empty: false }>> = {}) {
  return {
    empty: false as const,
    reference: {
      bookId: 43,
      chapterNumber: 3,
      verseStart: 16,
      verseEnd: null,
    },
    referenceText: "John 3:16",
    verses: [{ verseNumber: 16, text: "For God so loved the world…" }],
    tags: [],
    versionKey: "NASB1995",
    languageCode: "en",
    date: "2026-07-20",
    metrics: { poolTooSmall: false, missingBookNameLocalization: false },
    ...overrides,
  };
}

class FakeRepository extends NotificationsRepository {
  public toNotify: TokenToNotify[] = [];
  public active: ActiveToken[] = [];
  public markedNotified: { ids: string[]; date: string }[] = [];
  public softDeletedValues: string[] = [];
  public broadcasts: BroadcastAuditInput[] = [];

  constructor() {
    super({} as never);
  }

  async listActiveTokensToNotify(date: string): Promise<TokenToNotify[]> {
    // Simulate the SQL `last_notified_on IS DISTINCT FROM date` + soft-delete
    // filter: only rows not marked notified today survive.
    const notifiedIds = new Set(
      this.markedNotified.filter((m) => m.date === date).flatMap((m) => m.ids),
    );
    return this.toNotify.filter(
      (t) =>
        !notifiedIds.has(t.id) && !this.softDeletedValues.includes(t.token),
    );
  }

  async markNotified(tokenIds: string[], date: string): Promise<void> {
    if (tokenIds.length > 0) this.markedNotified.push({ ids: tokenIds, date });
  }

  async listAllActiveTokens(): Promise<ActiveToken[]> {
    return this.active.filter((t) => !this.softDeletedValues.includes(t.token));
  }

  async softDeleteTokensByValues(tokens: string[]): Promise<void> {
    this.softDeletedValues.push(...tokens);
  }

  async insertBroadcast(input: BroadcastAuditInput): Promise<void> {
    this.broadcasts.push(input);
  }
}

class FakePushClient implements PushClient {
  public sent: PushMessage[][] = [];
  public deadTokens = new Set<string>();
  public throwOnce = false;

  async send(messages: PushMessage[]): Promise<PushSendResult[]> {
    if (this.throwOnce) {
      this.throwOnce = false;
      throw new Error("network down");
    }
    this.sent.push(messages);
    return messages.map((m) =>
      this.deadTokens.has(m.to)
        ? { token: m.to, ok: false, error: "DeviceNotRegistered" }
        : { token: m.to, ok: true },
    );
  }
}

class FakeDailyVerse {
  public byUser = new Map<string, Verse>();
  public defaultVerse: Verse = makeVerse();
  public seenVersions: { userId: string | null; versionKey: string }[] = [];

  async getVerseOfTheDay(args: {
    date: string;
    versionKey: string;
    userId: string | null;
  }): Promise<Verse> {
    this.seenVersions.push({
      userId: args.userId,
      versionKey: args.versionKey,
    });
    return this.byUser.get(args.userId ?? "") ?? this.defaultVerse;
  }
}

function makeService(
  repo: FakeRepository,
  push: FakePushClient,
  daily: FakeDailyVerse,
) {
  return new NotificationsService({} as never, {
    repo,
    pushClient: push,
    dailyVerse: daily,
  });
}

describe("NotificationsService.sendDailyVerse", () => {
  let repo: FakeRepository;
  let push: FakePushClient;
  let daily: FakeDailyVerse;

  beforeEach(() => {
    repo = new FakeRepository();
    push = new FakePushClient();
    daily = new FakeDailyVerse();
  });

  it("sends one push per active token and marks them notified", async () => {
    repo.toNotify = [
      {
        id: "t1",
        token: "ExponentPushToken[a]",
        userId: "u1",
        preferredBibleVersion: "NASB1995",
      },
      {
        id: "t2",
        token: "ExponentPushToken[b]",
        userId: "u2",
        preferredBibleVersion: "KJV",
      },
    ];

    const result = await makeService(repo, push, daily).sendDailyVerse({
      date: "2026-07-20",
    });

    expect(result.scanned).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    // markNotified called with the OK ids.
    expect(repo.markedNotified.flatMap((m) => m.ids).sort()).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("uses each user's preferred version (personalized, D-2)", async () => {
    repo.toNotify = [
      {
        id: "t1",
        token: "ExponentPushToken[a]",
        userId: "u1",
        preferredBibleVersion: "KJV",
      },
      {
        id: "t2",
        token: "ExponentPushToken[b]",
        userId: "u2",
        preferredBibleVersion: null,
      },
    ];

    await makeService(repo, push, daily).sendDailyVerse({ date: "2026-07-20" });

    const u1 = daily.seenVersions.find((s) => s.userId === "u1");
    const u2 = daily.seenVersions.find((s) => s.userId === "u2");
    expect(u1?.versionKey).toBe("KJV");
    expect(u2?.versionKey).toBe("NASB1995"); // null → default
  });

  it("skips users whose verse is empty (no send, counted skippedEmpty)", async () => {
    repo.toNotify = [
      {
        id: "t1",
        token: "ExponentPushToken[a]",
        userId: "u1",
        preferredBibleVersion: "NASB1995",
      },
    ];
    daily.byUser.set("u1", {
      empty: true,
      date: "2026-07-20",
      fallbackMessage: "x",
    });

    const result = await makeService(repo, push, daily).sendDailyVerse({
      date: "2026-07-20",
    });

    expect(result.sent).toBe(0);
    expect(result.skippedEmpty).toBe(1);
    expect(push.sent).toHaveLength(0);
    expect(repo.markedNotified).toHaveLength(0);
  });

  it("prunes DeviceNotRegistered tokens and does not mark them notified", async () => {
    repo.toNotify = [
      {
        id: "t1",
        token: "ExponentPushToken[live]",
        userId: "u1",
        preferredBibleVersion: "NASB1995",
      },
      {
        id: "t2",
        token: "ExponentPushToken[dead]",
        userId: "u1",
        preferredBibleVersion: "NASB1995",
      },
    ];
    push.deadTokens.add("ExponentPushToken[dead]");

    const result = await makeService(repo, push, daily).sendDailyVerse({
      date: "2026-07-20",
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.pruned).toBe(1);
    expect(repo.softDeletedValues).toEqual(["ExponentPushToken[dead]"]);
    // Only the live token is marked notified.
    expect(repo.markedNotified.flatMap((m) => m.ids)).toEqual(["t1"]);
  });

  it("is idempotent: a second same-day run sends nothing (D-11)", async () => {
    repo.toNotify = [
      {
        id: "t1",
        token: "ExponentPushToken[a]",
        userId: "u1",
        preferredBibleVersion: "NASB1995",
      },
    ];
    const service = makeService(repo, push, daily);

    const first = await service.sendDailyVerse({ date: "2026-07-20" });
    const second = await service.sendDailyVerse({ date: "2026-07-20" });

    expect(first.sent).toBe(1);
    expect(second.scanned).toBe(0);
    expect(second.sent).toBe(0);
    expect(push.sent).toHaveLength(1); // only the first run sent
  });

  it("a push failure never fails the job and never re-sends already-notified tokens", async () => {
    repo.toNotify = [
      {
        id: "t1",
        token: "ExponentPushToken[a]",
        userId: "u1",
        preferredBibleVersion: "NASB1995",
      },
    ];
    push.throwOnce = true;

    const service = makeService(repo, push, daily);
    const first = await service.sendDailyVerse({ date: "2026-07-20" });
    // First run: send threw → counted failed, nothing marked notified.
    expect(first.failed).toBe(1);
    expect(repo.markedNotified).toHaveLength(0);

    // Re-run (retry): the token is still owed, now the send succeeds.
    const second = await service.sendDailyVerse({ date: "2026-07-20" });
    expect(second.sent).toBe(1);
    expect(repo.markedNotified.flatMap((m) => m.ids)).toEqual(["t1"]);
  });
});

describe("NotificationsService.broadcast", () => {
  let repo: FakeRepository;
  let push: FakePushClient;
  let daily: FakeDailyVerse;

  beforeEach(() => {
    repo = new FakeRepository();
    push = new FakePushClient();
    daily = new FakeDailyVerse();
  });

  it("fans out to all active tokens and writes an audit row", async () => {
    repo.active = [
      { id: "t1", token: "ExponentPushToken[a]", userId: "u1" },
      { id: "t2", token: "ExponentPushToken[b]", userId: "u2" },
    ];

    const result = await makeService(repo, push, daily).broadcast(
      { title: "Hi", body: "New book!", deepLink: null },
      "admin1",
    );

    expect(result.recipientCount).toBe(2);
    expect(push.sent[0]).toHaveLength(2);
    expect(repo.broadcasts).toHaveLength(1);
    expect(repo.broadcasts[0]).toMatchObject({
      adminUserId: "admin1",
      title: "Hi",
      recipientCount: 2,
      deepLink: null,
    });
  });

  it("rejects a deepLink that is not a versemate:// link (D-14)", async () => {
    repo.active = [{ id: "t1", token: "ExponentPushToken[a]", userId: "u1" }];

    await expect(
      makeService(repo, push, daily).broadcast(
        { title: "Hi", body: "x", deepLink: "https://evil.example.com" },
        "admin1",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(push.sent).toHaveLength(0);
    expect(repo.broadcasts).toHaveLength(0);
  });

  it("accepts a valid versemate:// deepLink", async () => {
    repo.active = [{ id: "t1", token: "ExponentPushToken[a]", userId: "u1" }];

    const result = await makeService(repo, push, daily).broadcast(
      {
        title: "Hi",
        body: "x",
        deepLink: "versemate:///bible/1/1?verseStart=1",
      },
      "admin1",
    );

    expect(result.recipientCount).toBe(1);
    expect(repo.broadcasts[0].deepLink).toBe(
      "versemate:///bible/1/1?verseStart=1",
    );
  });
});

describe("notification payload builders", () => {
  it("builds a versemate:// deep link with src=notification", () => {
    expect(
      buildVerseDeepLink({
        bookId: 43,
        chapterNumber: 3,
        verseStart: 16,
        verseEnd: null,
      }),
    ).toBe("versemate:///bible/43/3?verseStart=16&src=notification");
  });

  it("includes verseEnd when the reference is a range", () => {
    expect(
      buildVerseDeepLink({
        bookId: 1,
        chapterNumber: 1,
        verseStart: 1,
        verseEnd: 3,
      }),
    ).toBe("versemate:///bible/1/1?verseStart=1&src=notification&verseEnd=3");
  });

  it("truncates a long body to 140 chars with an ellipsis", () => {
    const long = "a".repeat(300);
    const out = truncateBody(long);
    expect(out.length).toBe(140);
    expect(out.endsWith("…")).toBe(true);
  });

  it("localizes the title with English fallback", () => {
    expect(verseNotificationTitle("en")).toBe("Verse of the Day");
    expect(verseNotificationTitle("pt-BR")).toBe("Versículo do Dia");
    expect(verseNotificationTitle("zz")).toBe("Verse of the Day");
    expect(verseNotificationTitle(null)).toBe("Verse of the Day");
  });

  it("builds a full verse notification payload", () => {
    const msg = buildVerseNotification(
      makeVerse() as Extract<Verse, { empty: false }>,
    );
    expect(msg.title).toBe("Verse of the Day");
    expect(msg.body.startsWith("John 3:16 —")).toBe(true);
    expect(msg.data?.type).toBe("verse_of_the_day");
    expect(msg.data?.deepLink).toContain("src=notification");
  });
});
