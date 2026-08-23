/**
 * Bible Brain domain logic.
 *
 * The product rule this encodes: some translations may be persisted for offline
 * use and some may only ever be streamed, and which is which is decided by
 * Bible Brain per fileset — not by us. So every version we advertise carries an
 * explicit `offline_capable` flag, letting the app offer downloads for the
 * subset that allows it while the rest stay online-only.
 */
import type { cache } from "../../shared/shared.plugin";
import {
  type BibleBrainBible,
  BibleBrainClient,
  type BibleBrainFileset,
} from "./bible-brain.client";

/** Download permissions are a property of the key and effectively static. */
const DOWNLOADABLE_TTL_SECONDS = 7 * 24 * 60 * 60;
const VERSIONS_TTL_SECONDS = 60 * 60;
/** Cap concurrent upstream probes so a cold listing doesn't fan out unbounded. */
const PROBE_CONCURRENCY = 6;

/** Minimum needed to probe a fileset: its id, and its coverage when known. */
type FilesetRef = { id: string; size?: string };

export interface VersionFileset {
  id: string;
  type: string;
  size: string;
  /** True when `/download` serves this fileset for our key. */
  offline_capable: boolean;
}

export interface BibleBrainVersion {
  abbr: string;
  name: string;
  language: string;
  iso: string;
  text_filesets: VersionFileset[];
  audio_filesets: VersionFileset[];
  /** Verse-level timing exists, so the reader can highlight while it reads. */
  has_verse_timing: boolean;
  /** At least one audio fileset may be downloaded for offline playback. */
  offline_capable: boolean;
}

export interface ChapterAudio {
  fileset_id: string;
  book_id: string;
  chapter: number;
  /** Signed, short-lived CDN URL. Never persist it — re-request instead. */
  url: string;
  duration_seconds: number | null;
  filesize_bytes: number | null;
  offline_capable: boolean;
  /** Lifetime left on the signed URL, so clients know when to re-request. */
  expires_in_seconds: number | null;
}

export interface VerseTimestamp {
  verse: number;
  seconds: number;
}

/**
 * Anchor chapter used to ask "is this fileset downloadable?". Has to exist
 * inside the fileset, so it follows the fileset's testament coverage: an
 * NT-only fileset has no Genesis.
 */
function probeAnchor(fileset: FilesetRef): { book: string; chapter: number } {
  const size = (fileset.size || "").toUpperCase();
  if (size === "OT" || (size.startsWith("OT") && !size.includes("NT"))) {
    return { book: "GEN", chapter: 1 };
  }
  if (size.includes("NT")) return { book: "MAT", chapter: 1 };
  // Complete/partial, or an unlabelled six-char text fileset: Matthew is the
  // safest single guess (present in NT, C, and most partials).
  const collection = fileset.id.length > 6 ? fileset.id[6] : undefined;
  if (collection === "O") return { book: "GEN", chapter: 1 };
  return { book: "MAT", chapter: 1 };
}

/**
 * Seconds remaining on a CloudFront-signed URL, read from its `Expires` claim.
 * Measured lifetime is ~19h against a daily UTC boundary, so this shrinks as
 * that boundary approaches and clients must not cache the URL past it.
 */
export function signedUrlExpiresInSeconds(
  url: string,
  now: number = Date.now(),
): number | null {
  try {
    const expires = new URL(url).searchParams.get("Expires");
    if (!expires) return null;
    const epoch = Number(expires);
    if (!Number.isFinite(epoch)) return null;
    return Math.max(0, Math.round(epoch - now / 1000));
  } catch {
    return null;
  }
}

/** Runs `worker` over `items` with a bounded number in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function flattenFilesets(bible: BibleBrainBible): BibleBrainFileset[] {
  return Object.values(bible.filesets ?? {}).flat();
}

const isAudio = (f: BibleBrainFileset) => f.type.startsWith("audio");
const isText = (f: BibleBrainFileset) => f.type.startsWith("text");

export class BibleBrainService {
  constructor(
    private readonly client: BibleBrainClient = new BibleBrainClient(),
    private readonly cache?: cache,
  ) {}

  get isConfigured(): boolean {
    return this.client.isConfigured;
  }

  /**
   * Whether a fileset may be persisted offline. Answered by actually calling
   * `/download` — the allowlist endpoint is 191 pages, so probing the single
   * fileset we care about is far cheaper than enumerating it.
   */
  async isDownloadable(fileset: FilesetRef): Promise<boolean> {
    const cacheKey = `biblebrain:downloadable:${fileset.id}`;
    // Wrapped in an object: the cache stores JSON objects, and a cached
    // `false` must stay distinguishable from a cache miss.
    //
    // A cache outage must NOT read as a negative verdict — that would
    // advertise downloadable versions as stream-only and silently hide the
    // download button. On any cache error we fall through to a live probe.
    try {
      const cached = await this.cache?.get<{ allowed: boolean }>(cacheKey);
      if (cached) return cached.allowed;
    } catch {
      // fall through to the upstream probe
    }

    const { book, chapter } = probeAnchor(fileset);
    const content = await this.client.getDownloadContent(
      fileset.id,
      book,
      chapter,
    );
    const allowed = Array.isArray(content) && content.length > 0;
    try {
      await this.cache?.set(
        cacheKey,
        { allowed },
        `${DOWNLOADABLE_TTL_SECONDS}s`,
      );
    } catch {
      // A cache write failure is not worth failing the request over.
    }
    return allowed;
  }

  /**
   * Versions available in a language, each annotated with whether it can go
   * offline and whether it supports verse-level highlighting.
   */
  async listVersions(
    languageCode: string,
    options: { includeOffline?: boolean } = {},
  ): Promise<BibleBrainVersion[]> {
    const includeOffline = options.includeOffline ?? true;
    const cacheKey = `biblebrain:versions:${languageCode}:${includeOffline}`;
    try {
      const cached = await this.cache?.get<{ versions: BibleBrainVersion[] }>(
        cacheKey,
      );
      if (cached) return cached.versions;
    } catch {
      // Cache unavailable: rebuild from upstream rather than failing the call.
    }

    const [audioBibles, textBibles, timedBibles] = await Promise.all([
      this.client.listBibles({ languageCode, media: "audio" }),
      this.client.listBibles({ languageCode, media: "text_plain" }),
      this.client.listBibles({
        languageCode,
        media: "audio",
        audioTiming: true,
      }),
    ]);

    const timed = new Set(timedBibles.map((b) => b.abbr));
    const byAbbr = new Map<string, BibleBrainBible>();
    for (const bible of [...textBibles, ...audioBibles]) {
      const existing = byAbbr.get(bible.abbr);
      if (!existing) {
        byAbbr.set(bible.abbr, bible);
        continue;
      }
      // Merge the fileset maps: the two queries return different subsets.
      byAbbr.set(bible.abbr, {
        ...existing,
        filesets: { ...existing.filesets, ...bible.filesets },
      });
    }

    // Probe every distinct audio fileset once, concurrently and bounded.
    const audioIds = new Map<string, BibleBrainFileset>();
    if (includeOffline) {
      for (const bible of byAbbr.values()) {
        for (const fileset of flattenFilesets(bible).filter(isAudio)) {
          audioIds.set(fileset.id, fileset);
        }
      }
    }
    const probeList = [...audioIds.values()];
    const probeResults = await mapLimit(
      probeList,
      PROBE_CONCURRENCY,
      async (f) => {
        try {
          return [f.id, await this.isDownloadable(f)] as const;
        } catch {
          // A probe failure must not sink the whole listing.
          return [f.id, false] as const;
        }
      },
    );
    const downloadable = new Map(probeResults);

    const versions: BibleBrainVersion[] = [...byAbbr.values()]
      .map((bible) => {
        const filesets = flattenFilesets(bible);
        const audio = filesets.filter(isAudio).map((f) => ({
          id: f.id,
          type: f.type,
          size: f.size,
          offline_capable: downloadable.get(f.id) ?? false,
        }));
        const text = filesets.filter(isText).map((f) => ({
          id: f.id,
          type: f.type,
          size: f.size,
          offline_capable: false,
        }));
        return {
          abbr: bible.abbr,
          name: bible.vname || bible.name,
          language: bible.language,
          iso: bible.iso,
          text_filesets: text,
          audio_filesets: audio,
          has_verse_timing: timed.has(bible.abbr),
          offline_capable: audio.some((f) => f.offline_capable),
        };
      })
      .sort((a, b) => a.abbr.localeCompare(b.abbr));

    try {
      await this.cache?.set(cacheKey, { versions }, `${VERSIONS_TTL_SECONDS}s`);
    } catch {
      // Non-fatal: the caller still gets a correct answer.
    }
    return versions;
  }

  /** Freshly-signed audio URL for a chapter. */
  async getChapterAudio(
    filesetId: string,
    book: string,
    chapter: number,
  ): Promise<ChapterAudio | null> {
    const items = await this.client.getChapterContent(filesetId, book, chapter);
    const playable = items.find((item) => Boolean(item.path));
    if (!playable?.path) return null;
    return {
      fileset_id: filesetId,
      book_id: playable.book_id,
      chapter,
      url: playable.path,
      duration_seconds: playable.duration ?? null,
      filesize_bytes: playable.filesize_in_bytes ?? null,
      // Size is unknown here; probeAnchor falls back to the fileset id's
      // collection character to pick a chapter that exists.
      offline_capable: await this.isDownloadable({ id: filesetId }).catch(
        () => false,
      ),
      expires_in_seconds: signedUrlExpiresInSeconds(playable.path),
    };
  }

  /**
   * Verse offsets for highlight-as-it-reads. Upstream emits a verse 0 marker
   * for the chapter heading; it is dropped so verse numbers line up with text.
   */
  async getVerseTimestamps(
    filesetId: string,
    book: string,
    chapter: number,
  ): Promise<VerseTimestamp[]> {
    const rows = await this.client.getTimestamps(filesetId, book, chapter);
    return rows
      .map((row) => ({
        verse: Number(row.verse_start),
        seconds: row.timestamp,
      }))
      .filter((row) => Number.isFinite(row.verse) && row.verse > 0)
      .sort((a, b) => a.verse - b.verse);
  }

  /** Chapter text, verse by verse. */
  async getChapterText(
    filesetId: string,
    book: string,
    chapter: number,
    range?: { verseStart?: number; verseEnd?: number },
  ): Promise<Array<{ verse: number; text: string }>> {
    const items = await this.client.getChapterContent(
      filesetId,
      book,
      chapter,
      range,
    );
    return items
      .filter((item) => typeof item.verse_text === "string")
      .map((item) => ({
        verse: item.verse_start ?? 0,
        text: (item.verse_text ?? "").trim(),
      }));
  }

  /** Copyright strings, which the UI is required to surface. */
  async getCopyright(
    bibleId: string,
  ): Promise<
    Array<{ fileset_id: string; type: string; copyright: string | null }>
  > {
    const rows = await this.client.getCopyright(bibleId);
    return rows.map((row) => ({
      fileset_id: row.id,
      type: row.type,
      copyright: row.copyright?.copyright ?? null,
    }));
  }

  /**
   * Licence-sanctioned download payload for offline storage. Null means this
   * fileset is stream-only for our key — the caller should tell the user so
   * rather than treating it as an error.
   */
  async getDownloadable(
    filesetId: string,
    book: string,
    chapter: number,
  ): Promise<{
    url: string;
    filesize_bytes: number | null;
    duration_seconds: number | null;
  } | null> {
    const items = await this.client.getDownloadContent(
      filesetId,
      book,
      chapter,
    );
    if (!items) return null;
    const item = items.find((entry) => Boolean(entry.path));
    if (!item?.path) return null;
    return {
      url: item.path,
      filesize_bytes: item.filesize_in_bytes ?? null,
      duration_seconds: item.duration ?? null,
    };
  }
}
