import { ValidationError } from "../../common/errors";
import {
  DailyVerseService,
  type EmptyVerseOfTheDayResult,
  type VerseOfTheDayResult,
  todayServerLocal,
} from "../../daily-verse/services/daily-verse.service";
import {
  ExpoPushClient,
  type PushClient,
  type PushMessage,
} from "../../shared/notification/push-client";
import type { cache, db } from "../../shared/shared.plugin";
import { NotificationsRepository } from "../repository/notifications.repository";

const DEFAULT_VERSION_KEY = "NASB1995";

/** Push body budget — stays within the collapsed-notification limit both OSes show. */
export const VERSE_NOTIFICATION_BODY_MAX = 140;

const DEEP_LINK_SCHEME = "versemate://";

/** Localized "Verse of the Day" title; English fallback (D-13). */
const VERSE_TITLE_BY_LANG: Record<string, string> = {
  en: "Verse of the Day",
  pt: "Versículo do Dia",
  es: "Versículo del Día",
};

export function verseNotificationTitle(languageCode: string | null): string {
  const code = (languageCode ?? "en").trim().toLowerCase().split("-")[0];
  return VERSE_TITLE_BY_LANG[code] ?? VERSE_TITLE_BY_LANG.en;
}

/** Truncate to the push budget, appending an ellipsis when clipped. */
export function truncateBody(text: string): string {
  if (text.length <= VERSE_NOTIFICATION_BODY_MAX) return text;
  return `${text.slice(0, VERSE_NOTIFICATION_BODY_MAX - 1).trimEnd()}…`;
}

/**
 * Deep link into the reader for a verse reference — same shape the widget uses
 * (`generate-chapter-share-url`), with `src=notification` so the tap handler
 * and analytics can tell notification opens from widget opens.
 */
export function buildVerseDeepLink(
  reference: VerseOfTheDayResult["reference"],
): string {
  const base = `versemate:///bible/${reference.bookId}/${reference.chapterNumber}?verseStart=${reference.verseStart}&src=notification`;
  return reference.verseEnd ? `${base}&verseEnd=${reference.verseEnd}` : base;
}

/** Build the push payload for a resolved (non-empty) verse of the day (D-13). */
export function buildVerseNotification(
  verse: VerseOfTheDayResult,
): PushMessage {
  const verseText = verse.verses.map((v) => v.text).join(" ");
  const body = truncateBody(`${verse.referenceText} — ${verseText}`);
  return {
    to: "", // filled per token by the caller
    title: verseNotificationTitle(verse.languageCode),
    body,
    data: {
      type: "verse_of_the_day",
      deepLink: buildVerseDeepLink(verse.reference),
    },
  };
}

export interface DailySendResult {
  scanned: number;
  sent: number;
  skippedEmpty: number;
  failed: number;
  pruned: number;
}

export interface BroadcastResult {
  recipientCount: number;
  pruned: number;
}

export interface NotificationsLogger {
  info?(message: string, metadata?: Record<string, unknown>): void;
  error?(message: string, metadata?: Record<string, unknown>): void;
}

/** The slice of DailyVerseService this worker needs (kept minimal for tests). */
export interface DailyVerseProvider {
  getVerseOfTheDay(args: {
    date: string;
    versionKey: string;
    userId: string | null;
  }): Promise<VerseOfTheDayResult | EmptyVerseOfTheDayResult>;
}

export class NotificationsService {
  private readonly repo: NotificationsRepository;
  private readonly pushClient: PushClient;
  private readonly dailyVerse: DailyVerseProvider;
  private readonly logger: NotificationsLogger;

  constructor(
    db: db,
    opts: {
      repo?: NotificationsRepository;
      pushClient?: PushClient;
      dailyVerse?: DailyVerseProvider;
      logger?: NotificationsLogger;
      cache?: cache;
    } = {},
  ) {
    this.repo = opts.repo ?? new NotificationsRepository(db);
    this.pushClient = opts.pushClient ?? new ExpoPushClient();
    this.dailyVerse =
      opts.dailyVerse ?? new DailyVerseService(db, undefined, opts.cache);
    this.logger = opts.logger ?? {};
  }

  async registerDevice({
    userId,
    token,
    platform,
  }: {
    userId: string;
    token: string;
    platform: string;
  }): Promise<void> {
    await this.repo.upsertDeviceToken({ userId, token, platform });
  }

  async unregisterDevice({
    userId,
    token,
  }: {
    userId: string;
    token: string;
  }): Promise<void> {
    await this.repo.softDeleteDeviceToken({ userId, token });
  }

  /**
   * Send today's personalized verse to every device not yet notified today.
   *
   * Idempotent (D-11): tokens are selected via `IS DISTINCT FROM today`, and a
   * token is stamped `last_notified_on = today` only after its send succeeds.
   * A retry, a double cron tick, or a manual re-trigger therefore never
   * double-notifies. Sends are grouped per user (one verse lookup each) and a
   * failed batch is logged, never thrown — so one bad user can't fail the job
   * and re-notify everyone already sent.
   */
  async sendDailyVerse({
    date,
  }: { date?: string } = {}): Promise<DailySendResult> {
    const targetDate = date ?? todayServerLocal();
    const tokens = await this.repo.listActiveTokensToNotify(targetDate);

    // Group tokens by user so we resolve the verse once per user.
    const byUser = new Map<
      string,
      { version: string | null; tokens: { id: string; token: string }[] }
    >();
    for (const row of tokens) {
      const entry = byUser.get(row.userId) ?? {
        version: row.preferredBibleVersion,
        tokens: [],
      };
      entry.tokens.push({ id: row.id, token: row.token });
      byUser.set(row.userId, entry);
    }

    let sent = 0;
    let skippedEmpty = 0;
    let failed = 0;
    let pruned = 0;

    for (const [userId, { version, tokens: userTokens }] of byUser) {
      const versionKey = version ?? DEFAULT_VERSION_KEY;
      let verse: VerseOfTheDayResult | EmptyVerseOfTheDayResult;
      try {
        verse = await this.dailyVerse.getVerseOfTheDay({
          date: targetDate,
          versionKey,
          userId,
        });
      } catch (error) {
        failed += userTokens.length;
        this.logger.error?.("[notifications] verse lookup failed", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (verse.empty) {
        skippedEmpty += userTokens.length;
        continue;
      }

      const template = buildVerseNotification(verse);
      const byToken = new Map(userTokens.map((t) => [t.token, t.id]));
      const messages: PushMessage[] = userTokens.map((t) => ({
        ...template,
        to: t.token,
      }));

      let results: Awaited<ReturnType<PushClient["send"]>>;
      try {
        results = await this.pushClient.send(messages);
      } catch (error) {
        // Never let one user's send failure fail the whole job (D-11).
        failed += messages.length;
        this.logger.error?.("[notifications] push send failed", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const okIds: string[] = [];
      const deadTokens: string[] = [];
      for (const result of results) {
        if (result.ok) {
          const id = byToken.get(result.token);
          if (id) okIds.push(id);
          sent += 1;
        } else {
          failed += 1;
          if (result.error === "DeviceNotRegistered") {
            deadTokens.push(result.token);
          }
        }
      }

      if (okIds.length > 0) await this.repo.markNotified(okIds, targetDate);
      if (deadTokens.length > 0) {
        await this.repo.softDeleteTokensByValues(deadTokens);
        pruned += deadTokens.length;
      }
    }

    const result: DailySendResult = {
      scanned: tokens.length,
      sent,
      skippedEmpty,
      failed,
      pruned,
    };
    this.logger.info?.("[notifications] daily verse send complete", {
      event: "VERSE_NOTIFICATION_SENT",
      date: targetDate,
      ...result,
    });
    return result;
  }

  /**
   * Send an ad-hoc notification to every active device (admin, D-14).
   * `deepLink`, when present, must use the versemate:// scheme (an open-redirect
   * guard — an admin could otherwise send users anywhere). The send is audited.
   */
  async broadcast(
    {
      title,
      body,
      deepLink,
    }: { title: string; body: string; deepLink?: string | null },
    adminUserId: string | null,
  ): Promise<BroadcastResult> {
    const link = (deepLink ?? "").trim();
    if (link && !link.startsWith(DEEP_LINK_SCHEME)) {
      throw new ValidationError(
        `deepLink must use the ${DEEP_LINK_SCHEME} scheme`,
      );
    }

    const tokens = await this.repo.listAllActiveTokens();
    let pruned = 0;

    if (tokens.length > 0) {
      const data: Record<string, unknown> = { type: "broadcast" };
      if (link) data.deepLink = link;
      const messages: PushMessage[] = tokens.map((t) => ({
        to: t.token,
        title,
        body,
        data,
      }));
      const results = await this.pushClient.send(messages);
      const deadTokens = results
        .filter((r) => !r.ok && r.error === "DeviceNotRegistered")
        .map((r) => r.token);
      if (deadTokens.length > 0) {
        await this.repo.softDeleteTokensByValues(deadTokens);
        pruned = deadTokens.length;
      }
    }

    await this.repo.insertBroadcast({
      adminUserId,
      title,
      body,
      deepLink: link || null,
      recipientCount: tokens.length,
    });

    return { recipientCount: tokens.length, pruned };
  }
}
