/**
 * Bible Brain (Digital Bible Platform v4) HTTP client.
 *
 * Narrated-scripture audio + text from Faith Comes By Hearing. Auth is a query
 * parameter (`key`), not a header, and `v=4` is mandatory — omitting the key
 * yields 422, not 401.
 *
 * Licence terms attached to our key, which shape this module:
 *   1. Audio may be streamed freely; persisting bytes is only sanctioned via
 *      the `/download` endpoint, which enforces a per-fileset allowlist.
 *   2. Bible content must not sit behind a paywall.
 *   3. Copyright text must be viewable by the user — hence `getCopyright`.
 */
import {
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  TooManyRequestsError,
} from "../../common/errors";

const DEFAULT_BASE_URL = "https://4.dbt.io/api";
const API_VERSION = "4";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Media types the upstream `/bibles?media=` filter accepts. */
export type BibleBrainMedia =
  | "audio"
  | "audio_drama"
  | "audio_stream"
  | "audio_drama_stream"
  | "text_plain"
  | "text_format"
  | "text_json"
  | "text_usx"
  | "text_html"
  | "video_stream";

export interface BibleBrainFileset {
  id: string;
  type: string;
  size: string;
}

export interface BibleBrainBible {
  abbr: string;
  name: string;
  vname: string | null;
  language: string;
  autonym: string;
  iso: string;
  /** Upstream nests filesets under an asset key (e.g. `dbp-prod`). */
  filesets: Record<string, BibleBrainFileset[]>;
}

/** One playable/readable item for a chapter. */
export interface BibleBrainChapterItem {
  book_id: string;
  book_name?: string;
  chapter_start: number | null;
  verse_start: number | null;
  verse_end: number | null;
  /** Signed CDN URL for audio; absent for text filesets. */
  path?: string;
  duration?: number | null;
  filesize_in_bytes?: number | null;
  verse_text?: string;
}

export interface BibleBrainTimestamp {
  book: string;
  chapter: string;
  verse_start: string;
  /** Offset into the chapter audio, in seconds. */
  timestamp: number;
}

export interface BibleBrainCopyright {
  id: string;
  type: string;
  size: string;
  copyright: {
    copyright: string | null;
    copyright_date: string | null;
    organizations?: Array<{ slug?: string; url_website?: string | null }>;
  };
}

export interface BibleBrainClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Raised when the key is absent. Distinct from an upstream failure: this is a
 * deployment problem, so it surfaces as a 500 rather than a 4xx.
 */
export class BibleBrainNotConfiguredError extends InternalServerError {
  constructor() {
    super("BIBLE_BRAIN_API_KEY is not configured");
  }
}

interface Paginated<T> {
  data: T;
}

function unwrap<T>(payload: Paginated<T> | T): T {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in (payload as Paginated<T>)
  ) {
    return (payload as Paginated<T>).data;
  }
  return payload as T;
}

export class BibleBrainClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  /** Last `X-RateLimit-Remaining` seen, for observability. */
  public rateLimitRemaining: number | null = null;

  constructor(options: BibleBrainClientOptions = {}) {
    // Read lazily rather than at module load so tests and scripts can set it.
    this.apiKey = options.apiKey ?? process.env.BIBLE_BRAIN_API_KEY;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private buildUrl(path: string, query: Record<string, string | undefined>) {
    if (!this.apiKey) throw new BibleBrainNotConfiguredError();
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("v", API_VERSION);
    url.searchParams.set("key", this.apiKey);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    return url;
  }

  /**
   * Performs the request and maps upstream status codes onto our error types.
   * `allow404`/`allow403` let callers treat those as "absent" instead of throwing —
   * a 403 from `/download` means "not licensed for offline", which is a normal
   * answer rather than a failure.
   */
  private async request<T>(
    path: string,
    query: Record<string, string | undefined> = {},
    opts: { allow403?: boolean; allow404?: boolean } = {},
  ): Promise<T | null> {
    const url = this.buildUrl(path, query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new InternalServerError(`Bible Brain request failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    const remaining = response.headers.get("X-RateLimit-Remaining");
    if (remaining !== null) {
      const parsed = Number(remaining);
      this.rateLimitRemaining = Number.isNaN(parsed) ? null : parsed;
    }

    if (response.ok) {
      return unwrap<T>((await response.json()) as Paginated<T> | T);
    }

    // The key is scoped per fileset; 403 is a licence decision, not an outage.
    if (response.status === 403) {
      if (opts.allow403) return null;
      throw new ForbiddenError(
        `Bible Brain denied access to ${path} (fileset not licensed for this key)`,
      );
    }
    if (response.status === 404) {
      if (opts.allow404) return null;
      throw new NotFoundError(`Bible Brain has no content for ${path}`);
    }
    if (response.status === 429) {
      throw new TooManyRequestsError("Bible Brain rate limit exceeded");
    }
    // 422 means the key was rejected or a param was invalid.
    if (response.status === 422) {
      throw new InternalServerError(
        "Bible Brain rejected the request (check BIBLE_BRAIN_API_KEY and params)",
      );
    }
    throw new InternalServerError(
      `Bible Brain returned ${response.status} for ${path}`,
    );
  }

  /** Bibles, optionally narrowed by language, media type, and timing support. */
  async listBibles(params: {
    languageCode?: string;
    media?: BibleBrainMedia;
    audioTiming?: boolean;
    limit?: number;
  }): Promise<BibleBrainBible[]> {
    const rows = await this.request<BibleBrainBible[]>("/bibles", {
      language_code: params.languageCode,
      media: params.media,
      audio_timing: params.audioTiming ? "true" : undefined,
      limit: params.limit ? String(params.limit) : "100",
    });
    return rows ?? [];
  }

  /**
   * Chapter content. An audio fileset yields one item with a signed `path`;
   * a text fileset yields one item per verse.
   *
   * The signed URL expires (measured ~19h, on a daily UTC boundary) — never
   * persist it, always re-mint.
   */
  async getChapterContent(
    filesetId: string,
    book: string,
    chapter: number,
    range?: { verseStart?: number; verseEnd?: number },
  ): Promise<BibleBrainChapterItem[]> {
    const rows = await this.request<BibleBrainChapterItem[]>(
      `/bibles/filesets/${encodeURIComponent(filesetId)}/${encodeURIComponent(book)}/${chapter}`,
      {
        verse_start: range?.verseStart ? String(range.verseStart) : undefined,
        verse_end: range?.verseEnd ? String(range.verseEnd) : undefined,
      },
    );
    return rows ?? [];
  }

  /** Verse-level offsets into the chapter audio. Empty when unsupported. */
  async getTimestamps(
    filesetId: string,
    book: string,
    chapter: number,
  ): Promise<BibleBrainTimestamp[]> {
    const rows = await this.request<BibleBrainTimestamp[]>(
      `/timestamps/${encodeURIComponent(filesetId)}/${encodeURIComponent(book)}/${chapter}`,
      {},
      { allow404: true },
    );
    return rows ?? [];
  }

  /** Copyright + licensor info. Required by licence term 3 to be user-visible. */
  async getCopyright(bibleId: string): Promise<BibleBrainCopyright[]> {
    const rows = await this.request<BibleBrainCopyright[]>(
      `/bibles/${encodeURIComponent(bibleId)}/copyright`,
      {},
      { allow404: true },
    );
    return rows ?? [];
  }

  /**
   * The only licence-sanctioned way to obtain persistable bytes. Returns null
   * when the fileset is not on this key's download allowlist (upstream 403),
   * which is the normal answer for e.g. NLT, NKJV, CSB.
   */
  async getDownloadContent(
    filesetId: string,
    book: string,
    chapter: number,
  ): Promise<BibleBrainChapterItem[] | null> {
    return this.request<BibleBrainChapterItem[]>(
      `/download/${encodeURIComponent(filesetId)}/${encodeURIComponent(book)}/${chapter}`,
      {},
      { allow403: true, allow404: true },
    );
  }
}
