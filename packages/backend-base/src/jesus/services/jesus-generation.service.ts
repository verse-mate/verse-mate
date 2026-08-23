import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { type AiProvider, getAiProvider } from "../../shared/ai";
import type { db } from "../../shared/shared.plugin";
import {
  JESUS_FACET_META,
  JESUS_FACET_TYPES,
  JESUS_PROVENANCE,
  type JesusEventExplanationType,
  type JesusFacetType,
  getFacetTypeFromSlug,
} from "../jesus.constants";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import { JesusRepository } from "../repository/jesus.repository";
import {
  type ExtractedFacet,
  type ValidationIssue,
  referenceKey,
  validateExtraction,
  validateNarrative,
  validateTopicBrief,
} from "../utils/generation-validation";
import { fillTemplate } from "../utils/template.utils";
import { JesusEventService } from "./jesus-event.service";

const DEFAULT_MODEL = "gpt-5";

/**
 * Shared by the synchronous and batched paths so a batched record is generated
 * under exactly the same settings as a synchronous one — otherwise "we batched
 * it" would quietly mean "we generated it differently".
 */
export const GENERATION_REASONING_EFFORT = "medium" as const;
export const GENERATION_MAX_OUTPUT_TOKENS = 8000;

/**
 * Extraction needs far more room than a narrative layer. It returns one object
 * per facet for a whole event, so a three-Gospel episode or a long discourse
 * (John 17) produces a large array — and reasoning tokens count toward this
 * ceiling too. At 8000 the response was cut mid-array and surfaced only as
 * `unparseable JSON: Unexpected EOF`, so extraction failed on precisely the
 * richest events while short ones looked fine. The batch service hit the same
 * wall on long study chapters and raised its ceiling for the same reason.
 */
export const EXTRACTION_MAX_OUTPUT_TOKENS = 32000;
const DEFAULT_LANGUAGE = "en-US";

/**
 * Provenance by content type. Nothing generated is stored at level 1 — level 1
 * means "explicitly present in the text", and prose about a passage is not that
 * even when it is accurate. Extraction is the one path that can produce level-1
 * rows, and only after its quotations are matched against the source.
 */
const PROVENANCE_BY_TYPE: Record<JesusEventExplanationType, number> = {
  overview: JESUS_PROVENANCE.INTERPRETATION,
  compare: JESUS_PROVENANCE.INTERPRETATION,
  insights: JESUS_PROVENANCE.SYNTHESIS,
  application: JESUS_PROVENANCE.SYNTHESIS,
};

/** A passage with its verse text loaded. */
interface PassageWithVerses {
  book_name: string;
  chapter: number;
  display: string;
  verses: Array<{ verse_number: number; text: string }>;
}

export interface GenerationResult {
  eventSlug: string;
  type: string;
  status: "saved" | "rejected" | "skipped";
  issues?: ValidationIssue[];
  chars?: number;
}

/** The prompt template behind every topic brief, whatever the category. */
export const TOPIC_BRIEF_TEMPLATE_TYPE = "jesus-topic-brief";

/**
 * A brief is prose about passages, so it is an interpretation — never level 1,
 * which means "explicitly present in the text".
 */
const TOPIC_BRIEF_PROVENANCE = JESUS_PROVENANCE.INTERPRETATION;

/**
 * How many of a topic's sayings reach the prompt.
 *
 * A brief is three sentences; it does not need forty quotations to write them,
 * and an unbounded list would put the largest topics over the context the rest
 * of the pipeline is tuned for. The sayings are taken in chronological order,
 * so the cap trims the tail of a long topic rather than sampling it randomly.
 */
export const TOPIC_BRIEF_SAYING_LIMIT = 24;

export interface TopicBriefResult {
  facetType: string;
  themeSlug: string;
  status: "saved" | "rejected" | "skipped";
  issues?: ValidationIssue[];
  chars?: number;
  /** Why a topic was skipped, when it was not simply already written. */
  detail?: string;
}

/**
 * Generates the narrative layers of an event, and extracts its facets.
 *
 * Two things make this different from a plain "ask the model" call:
 *
 *  1. It uses the SAME theological framework as the rest of the commentary —
 *     the `system` prompt row — rather than a Jesus-specific voice. The feature
 *     should not read as though a different theology wrote it.
 *
 *  2. The passage text is supplied in the prompt rather than recalled from the
 *     model's memory, and the output is validated against that same text before
 *     it is stored.
 */
export class JesusGenerationService {
  private events: JesusEventRepository;
  private eventService: JesusEventService;
  private taxonomy: JesusRepository;
  private prompts: PromptRepository;
  private templates: UserPromptRepository;
  // Resolved lazily: the OpenAI provider's constructor needs a key, and this
  // service is constructed at plugin load.
  private _ai: AiProvider | null = null;
  private get ai(): AiProvider {
    if (!this._ai) this._ai = getAiProvider();
    return this._ai;
  }

  constructor(private readonly db: db) {
    this.events = new JesusEventRepository(this.db);
    this.eventService = new JesusEventService(this.db);
    this.taxonomy = new JesusRepository(this.db);
    this.prompts = new PromptRepository(this.db);
    this.templates = new UserPromptRepository(this.db);
  }

  /**
   * The theological framework every other explanation in VerseMate is written
   * against. Reused verbatim so Jesus content cannot drift from the rest.
   *
   * Public because the enrichment script writes doctrinal content too — "what
   * this event reveals about who Jesus is" is a theological claim, not a fact
   * of the narrative — and it generates outside this service. A second path to
   * the reader that skips the framework is exactly the drift the note above
   * says must not happen.
   */
  async getSystemPrompt(): Promise<{ id: number; text: string }> {
    const prompt = await this.prompts.getActivePrompt();
    return { id: prompt.prompt_id, text: prompt.prompt };
  }

  private async getTemplate(type: string): Promise<string | null> {
    const row = await this.templates.getActivePromptByType(
      `jesus-event-${type}`,
    );
    return row?.prompt_template ?? null;
  }

  /**
   * The topic-brief template.
   *
   * Fetched by its own name rather than through `getTemplate`, which prefixes
   * `jesus-event-`: a brief describes a category's treatment of a theme, not an
   * event, and filing it under the event namespace would misname it forever.
   */
  private async getTopicBriefTemplate(): Promise<string | null> {
    const row = await this.templates.getActivePromptByType(
      TOPIC_BRIEF_TEMPLATE_TYPE,
    );
    return row?.prompt_template ?? null;
  }

  /**
   * Everything a run needs before it starts: the shared theological framework
   * and a template per requested type. Returns human-readable problems rather
   * than throwing, so a caller can report them all at once.
   */
  async checkPreconditions(types: readonly string[]): Promise<string[]> {
    const problems: string[] = [];

    try {
      await this.getSystemPrompt();
    } catch {
      problems.push(
        "no active `system` prompt — the theological framework the rest of the commentary uses",
      );
    }

    for (const type of types) {
      if (!(await this.getTemplate(type))) {
        problems.push(`no active \`jesus-event-${type}\` prompt template`);
      }
    }

    return problems;
  }

  /**
   * The topic-brief counterpart of `checkPreconditions`: same contract, same
   * reason — one legible sentence up front beats N stack traces.
   */
  async checkTopicBriefPreconditions(): Promise<string[]> {
    const problems: string[] = [];

    try {
      await this.getSystemPrompt();
    } catch {
      problems.push(
        "no active `system` prompt — the theological framework the rest of the commentary uses",
      );
    }

    if (!(await this.getTopicBriefTemplate())) {
      problems.push(
        `no active \`${TOPIC_BRIEF_TEMPLATE_TYPE}\` prompt template`,
      );
    }

    return problems;
  }

  /** Book names in the canon, for the reference-scope gate. */
  private async getBookNames(): Promise<string[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("books")
      .select("name")
      .execute();
    return rows.map((r) => r.name);
  }

  /**
   * Book name → chapter count. Passed to the scope check so a number sitting
   * after a book name in prose is not mistaken for a citation.
   */
  private async getChapterCounts(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .innerJoin("books", "books.book_id", "chapters.book_id")
      .select(({ fn }) => [
        "books.name as name",
        fn.max("chapters.chapter_number").as("max_chapter"),
      ])
      .groupBy("books.name")
      .execute();
    return new Map(rows.map((r) => [r.name, Number(r.max_chapter)]));
  }

  /**
   * Render the passage the model is allowed to reason from.
   *
   * Verse text comes from the database in the requested version, never from the
   * model. Everything downstream — the scope gate, the quotation gate — checks
   * against exactly this string.
   */
  private renderPassages(passages: PassageWithVerses[]): string {
    return passages
      .map((p) => {
        const body = p.verses.length
          ? p.verses.map((v) => `${v.verse_number} ${v.text}`).join(" ")
          : "(text unavailable in this version)";
        return `### ${p.display}\n${body}`;
      })
      .join("\n\n");
  }

  /**
   * Generate one narrative layer for one event.
   *
   * `dryRun` renders and validates the prompt without calling the model, which
   * is how the CLI reports what a full run would cost and send.
   */
  async generateForEvent(
    eventSlug: string,
    type: JesusEventExplanationType,
    options: {
      languageCode?: string;
      bibleVersion?: string;
      model?: string;
      dryRun?: boolean;
      overwrite?: boolean;
    } = {},
  ): Promise<GenerationResult> {
    const {
      languageCode = DEFAULT_LANGUAGE,
      bibleVersion = "NASB1995",
      model = DEFAULT_MODEL,
      dryRun = false,
      overwrite = false,
    } = options;

    const prepared = await this.prepareInput(eventSlug, type, {
      languageCode,
      bibleVersion,
      overwrite,
    });
    if ("status" in prepared) return prepared;
    const { input } = prepared;

    if (dryRun) {
      return { eventSlug, type, status: "skipped", chars: input.length };
    }

    const system = await this.getSystemPrompt();
    const response = await this.ai.responsesCreate({
      model,
      instructions: system.text,
      input,
      reasoningEffort: GENERATION_REASONING_EFFORT,
      maxOutputTokens: GENERATION_MAX_OUTPUT_TOKENS,
    });

    return this.acceptGeneratedContent(
      eventSlug,
      type,
      response.outputText,
      response.model,
      { languageCode, bibleVersion },
    );
  }

  /**
   * Resolve an event and render its prompt, or explain why there is nothing to
   * send. Shared by the synchronous and batched paths so both submit byte-for
   * -byte the same prompt.
   */
  private async prepareInput(
    eventSlug: string,
    type: JesusEventExplanationType,
    options: {
      languageCode?: string;
      bibleVersion?: string;
      overwrite?: boolean;
    } = {},
  ): Promise<{ input: string } | GenerationResult> {
    const {
      languageCode = DEFAULT_LANGUAGE,
      bibleVersion = "NASB1995",
      overwrite = false,
    } = options;

    const event = await this.events.getEventBySlug(eventSlug, languageCode);
    if (!event) {
      return {
        eventSlug,
        type,
        status: "skipped",
        issues: [{ rule: "missing-event", detail: eventSlug }],
      };
    }

    if (!overwrite) {
      const existing = await this.events.getExplanation(
        event.event_id,
        languageCode,
        type,
      );
      if (existing?.content) {
        return { eventSlug, type, status: "skipped" };
      }
    }

    const template = await this.getTemplate(type);
    if (!template) {
      return {
        eventSlug,
        type,
        status: "rejected",
        issues: [
          {
            rule: "template",
            detail: `no active jesus-event-${type} template`,
          },
        ],
      };
    }

    const passages = await this.loadPassageText(
      event.slug,
      bibleVersion,
      languageCode,
    );
    const passageBlock = this.renderPassages(passages);

    const facetLines = event.facets
      .map(
        (f) =>
          `- [${f.mode}/${f.type}] ${f.title}${f.text ? ` — "${f.text}"` : ""}${f.reference ? ` (${f.reference})` : ""}`,
      )
      .join("\n");

    const input = fillTemplate(template, {
      event_title: event.title,
      event_summary: event.summary ?? "",
      gospel_accounts: event.passages.map((p) => p.display).join(" · "),
      passages: passageBlock,
      facets: facetLines || "(none catalogued)",
      themes: event.themes.map((t) => t.name).join(", ") || "(none)",
      period: event.period_name ?? "(unplaced)",
    });

    return { input };
  }

  /**
   * Everything `generateForEvent` does *before* the model call, returned rather
   * than sent. This is what lets the same prompt be submitted through the Batch
   * API — half the price of the synchronous path, and one job instead of N
   * requests that can die halfway through on a 429.
   *
   * Returns a `GenerationResult` instead when there is nothing to send: the
   * event is missing, it already has content, or its template is inactive.
   */
  async buildGenerationRequest(
    eventSlug: string,
    type: JesusEventExplanationType,
    options: {
      languageCode?: string;
      bibleVersion?: string;
      model?: string;
      overwrite?: boolean;
    } = {},
  ): Promise<
    | { status: "ready"; instructions: string; input: string; model: string }
    | GenerationResult
  > {
    const prepared = await this.prepareInput(eventSlug, type, options);
    if ("status" in prepared) return prepared;
    const system = await this.getSystemPrompt();
    return {
      status: "ready",
      instructions: system.text,
      input: prepared.input,
      model: options.model ?? DEFAULT_MODEL,
    };
  }

  /**
   * Just the rendered passage text for an event — no template, no task
   * description. A caller that has its own instructions must not be handed
   * another prompt's wrapper: doing so puts two competing task descriptions in
   * front of the model, and it follows the embedded one.
   */
  async renderEventPassages(
    eventSlug: string,
    options: { languageCode?: string; bibleVersion?: string } = {},
  ): Promise<string | null> {
    const languageCode = options.languageCode ?? DEFAULT_LANGUAGE;
    const bibleVersion = options.bibleVersion ?? "NASB1995";
    const event = await this.events.getEventBySlug(eventSlug, languageCode);
    if (!event) return null;
    const passages = await this.loadPassageText(
      event.slug,
      bibleVersion,
      languageCode,
    );
    const rendered = this.renderPassages(passages);
    return rendered.trim() ? rendered : null;
  }

  /**
   * The extraction prompt, returned rather than sent — the batch counterpart of
   * `extractFacets`, for the same reason the narrative layers have one.
   */
  async buildExtractionRequest(
    eventSlug: string,
    options: {
      languageCode?: string;
      bibleVersion?: string;
      model?: string;
    } = {},
  ): Promise<
    | {
        status: "ready";
        instructions: string;
        input: string;
        model: string;
        sourceText: string;
      }
    | { status: "skipped" | "error"; detail: string }
  > {
    const languageCode = options.languageCode ?? DEFAULT_LANGUAGE;
    const bibleVersion = options.bibleVersion ?? "NASB1995";

    const event = await this.events.getEventBySlug(eventSlug, languageCode);
    if (!event) return { status: "error", detail: "event not found" };

    const template = await this.getTemplate("extraction");
    if (!template)
      return {
        status: "error",
        detail: "no active jesus-event-extraction template",
      };

    const passages = await this.loadPassageText(
      event.slug,
      bibleVersion,
      languageCode,
    );
    const sourceText = passages
      .flatMap((p) => p.verses.map((v) => v.text))
      .join(" ");
    if (!sourceText.trim())
      return { status: "skipped", detail: `no verse text in ${bibleVersion}` };

    const system = await this.getSystemPrompt();
    const input = fillTemplate(template, {
      event_title: event.title,
      passages: this.renderPassages(passages),
      allowed_types: JESUS_FACET_TYPES.join(" | "),
    });

    return {
      status: "ready",
      instructions: system.text,
      input,
      model: options.model ?? DEFAULT_MODEL,
      sourceText,
    };
  }

  /**
   * Validate a batched extraction response against the passage text it was
   * given — the same gate `extractFacets` applies, so a batched facet earns
   * level 1 the same way a synchronous one does.
   */
  acceptExtraction(outputText: string, sourceText: string) {
    let parsed: { facets?: ExtractedFacet[] };
    try {
      parsed = JSON.parse(stripCodeFence(outputText));
    } catch (error) {
      return {
        accepted: [] as ExtractedFacet[],
        rejected: [] as Array<{
          facet: ExtractedFacet;
          issues: ValidationIssue[];
        }>,
        error: `unparseable JSON: ${(error as Error).message}`,
      };
    }
    const { valid, rejected } = validateExtraction({
      facets: parsed.facets ?? [],
      sourceText,
      allowedTypes: JESUS_FACET_TYPES,
    });
    return {
      accepted: valid,
      rejected,
      error: undefined as string | undefined,
    };
  }

  /**
   * Everything `generateForEvent` does *after* the model call: the same
   * validation gate and the same write. Shared so a batched response is held to
   * exactly the standard a synchronous one is — a record that fails is rejected
   * and re-run, never stored with a caveat nobody will read.
   */
  async acceptGeneratedContent(
    eventSlug: string,
    type: JesusEventExplanationType,
    outputText: string,
    model: string,
    options: { languageCode?: string; bibleVersion?: string } = {},
  ): Promise<GenerationResult> {
    const languageCode = options.languageCode ?? DEFAULT_LANGUAGE;
    const event = await this.events.getEventBySlug(eventSlug, languageCode);
    if (!event) {
      return {
        eventSlug,
        type,
        status: "skipped",
        issues: [{ rule: "missing-event", detail: eventSlug }],
      };
    }
    const system = await this.getSystemPrompt();
    const response = { outputText, model };

    const bookNames = await this.getBookNames();
    const chapterCounts = await this.getChapterCounts();
    const allowed = new Set(
      event.passages.map((p) => referenceKey(p.book_name, p.chapter)),
    );

    const issues = validateNarrative({
      content: response.outputText,
      type,
      bookNames,
      chapterCounts,
      allowedReferences: allowed,
    });

    if (issues.length) {
      // Rejected, not downgraded. A record that fails a gate is re-run rather
      // than stored with a caveat nobody will read.
      return { eventSlug, type, status: "rejected", issues };
    }

    await this.events.saveExplanation({
      eventId: event.event_id,
      type,
      content: response.outputText.trim(),
      languageCode,
      provenance: PROVENANCE_BY_TYPE[type],
      promptId: system.id,
      model: response.model,
    });

    return {
      eventSlug,
      type,
      status: "saved",
      chars: response.outputText.length,
    };
  }

  /**
   * Extract typed facets from an event's passages.
   *
   * This is the only path that can produce level-1 rows, and it earns them:
   * every quoted saying is matched back against the supplied verse text before
   * it is stored, so an invented-but-plausible saying is rejected rather than
   * filed as scripture.
   */
  async extractFacets(
    eventSlug: string,
    options: {
      languageCode?: string;
      bibleVersion?: string;
      model?: string;
      dryRun?: boolean;
    } = {},
  ): Promise<{
    eventSlug: string;
    accepted: ExtractedFacet[];
    rejected: Array<{ facet: ExtractedFacet; issues: ValidationIssue[] }>;
    status: "ok" | "skipped" | "error";
    detail?: string;
  }> {
    const {
      languageCode = DEFAULT_LANGUAGE,
      bibleVersion = "NASB1995",
      model = DEFAULT_MODEL,
      dryRun = false,
    } = options;

    const event = await this.events.getEventBySlug(eventSlug, languageCode);
    if (!event) {
      return {
        eventSlug,
        accepted: [],
        rejected: [],
        status: "error",
        detail: "event not found",
      };
    }

    const template = await this.getTemplate("extraction");
    if (!template) {
      return {
        eventSlug,
        accepted: [],
        rejected: [],
        status: "error",
        detail: "no active jesus-event-extraction template",
      };
    }

    const passages = await this.loadPassageText(
      event.slug,
      bibleVersion,
      languageCode,
    );
    const sourceText = passages
      .flatMap((p) => p.verses.map((v) => v.text))
      .join(" ");

    if (!sourceText.trim()) {
      return {
        eventSlug,
        accepted: [],
        rejected: [],
        status: "skipped",
        detail: `no verse text available in ${bibleVersion}`,
      };
    }

    if (dryRun) {
      return {
        eventSlug,
        accepted: [],
        rejected: [],
        status: "skipped",
        detail: "dry run",
      };
    }

    const system = await this.getSystemPrompt();
    const input = fillTemplate(template, {
      event_title: event.title,
      passages: this.renderPassages(passages),
      allowed_types: JESUS_FACET_TYPES.join(" | "),
    });

    const response = await this.ai.responsesCreate({
      model,
      instructions: system.text,
      input,
      reasoningEffort: "medium",
      maxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
    });

    let parsed: { facets?: ExtractedFacet[] };
    try {
      parsed = JSON.parse(stripCodeFence(response.outputText));
    } catch (error) {
      return {
        eventSlug,
        accepted: [],
        rejected: [],
        status: "error",
        detail: `unparseable JSON: ${(error as Error).message}`,
      };
    }

    const { valid, rejected } = validateExtraction({
      facets: parsed.facets ?? [],
      sourceText,
      allowedTypes: JESUS_FACET_TYPES,
    });

    return { eventSlug, accepted: valid, rejected, status: "ok" };
  }

  // ── Topic briefs ────────────────────────────────────────────────────────

  /**
   * What He teaches — or asks, or claims, or does — about one theme.
   *
   * The category browse groups a category's events under their themes, and each
   * group was described by the theme's own blurb: the same sentence about the
   * Kingdom under Teachings, under Miracles and under Parables. A brief is the
   * sentence that group actually needs, written per (category × theme) from the
   * sayings that sit in it.
   *
   * The model is given the real sayings from the database — never asked to
   * recall them — and the output is checked back against exactly those before
   * it is stored.
   */
  async generateTopicBrief(
    facetTypeOrSlug: string,
    themeSlug: string,
    options: {
      languageCode?: string;
      model?: string;
      dryRun?: boolean;
      overwrite?: boolean;
    } = {},
  ): Promise<TopicBriefResult> {
    const {
      languageCode = DEFAULT_LANGUAGE,
      model = DEFAULT_MODEL,
      dryRun = false,
      overwrite = false,
    } = options;

    const prepared = await this.prepareTopicBriefInput(
      facetTypeOrSlug,
      themeSlug,
      { languageCode, overwrite },
    );
    if ("status" in prepared) return prepared;

    if (dryRun) {
      return {
        facetType: prepared.facetType,
        themeSlug,
        status: "skipped",
        chars: prepared.input.length,
        detail: "dry run",
      };
    }

    const system = await this.getSystemPrompt();
    const response = await this.ai.responsesCreate({
      model,
      instructions: system.text,
      input: prepared.input,
      reasoningEffort: GENERATION_REASONING_EFFORT,
      maxOutputTokens: GENERATION_MAX_OUTPUT_TOKENS,
    });

    return await this.acceptTopicBrief(
      prepared.facetType,
      themeSlug,
      response.outputText,
      response.model,
      { languageCode },
    );
  }

  /**
   * Resolve a (category, theme) pair and render its prompt, or explain why
   * there is nothing to send.
   *
   * Split out for the same reason the event path splits it: a dry run has to
   * produce byte-for-byte the prompt a real run would submit, or it is
   * reporting on something else.
   */
  private async prepareTopicBriefInput(
    facetTypeOrSlug: string,
    themeSlug: string,
    options: { languageCode?: string; overwrite?: boolean } = {},
  ): Promise<
    | {
        facetType: JesusFacetType;
        themeId: string;
        input: string;
        sourceText: string;
        allowedReferences: Set<string>;
      }
    | TopicBriefResult
  > {
    const { languageCode = DEFAULT_LANGUAGE, overwrite = false } = options;

    const facetType = getFacetTypeFromSlug(facetTypeOrSlug);
    if (!facetType) {
      return {
        facetType: facetTypeOrSlug,
        themeSlug,
        status: "skipped",
        detail: `unknown category "${facetTypeOrSlug}"`,
      };
    }

    const themes = await this.taxonomy.getThemes(languageCode);
    const theme = themes.find((t) => t.slug === themeSlug);
    if (!theme) {
      return {
        facetType,
        themeSlug,
        status: "skipped",
        detail: `unknown theme "${themeSlug}"`,
      };
    }

    if (!overwrite) {
      const existing = await this.events.getTopicBrief(
        facetType,
        theme.theme_id,
        languageCode,
      );
      if (existing?.content) {
        return { facetType, themeSlug, status: "skipped" };
      }
    }

    const template = await this.getTopicBriefTemplate();
    if (!template) {
      return {
        facetType,
        themeSlug,
        status: "rejected",
        issues: [
          {
            rule: "template",
            detail: `no active ${TOPIC_BRIEF_TEMPLATE_TYPE} template`,
          },
        ],
      };
    }

    // Exactly the corpus the browse screen groups under this heading — same
    // filter, including the speaker/actor guard that keeps "every question
    // Jesus asked" from matching questions asked of Him.
    const events = await this.events.listEvents(
      { ...this.eventService.facetFilter([facetType]), themeSlug },
      { limit: 200, languageCode },
    );

    const sayings = events
      .flatMap((event) =>
        event.facets
          .filter((facet) => facet.type === facetType)
          .map((facet) => ({ event, facet })),
      )
      .slice(0, TOPIC_BRIEF_SAYING_LIMIT);

    if (sayings.length === 0) {
      return {
        facetType,
        themeSlug,
        status: "skipped",
        detail: "no events in this topic",
      };
    }

    const meta = JESUS_FACET_META[facetType];
    const sayingLines = sayings
      .map(({ event, facet }) => {
        const quote = facet.text ? ` — "${facet.text}"` : "";
        const where = facet.reference ? ` (${facet.reference})` : "";
        return `- ${facet.title}${quote}${where} [in: ${event.title}]`;
      })
      .join("\n");

    const input = fillTemplate(template, {
      category_label: meta.label,
      category_singular: meta.singular,
      category_plural: meta.plural,
      category_mode: meta.mode === "ACTION" ? "did" : "said",
      topic_name: theme.name,
      topic_description: theme.description ?? "(none recorded)",
      sayings: sayingLines,
      event_count: String(events.length),
      accounts:
        [
          ...new Set(events.flatMap((e) => e.passages.map((p) => p.book_name))),
        ].join(", ") || "(none)",
    });

    return {
      facetType,
      themeId: theme.theme_id,
      input,
      // The quotation gate matches against the sayings the model was given —
      // nothing else counts as grounded.
      sourceText: sayings
        .map(({ facet }) => facet.text ?? facet.title)
        .join(" \u00b7 "),
      allowedReferences: new Set(
        events.flatMap((event) =>
          event.passages.map((p) => referenceKey(p.book_name, p.chapter)),
        ),
      ),
    };
  }

  /**
   * Everything `generateTopicBrief` does *before* the model call, returned
   * rather than sent.
   *
   * The event path has the same split so its prompts can go through the Batch
   * API; here it is what lets a run be inspected before it is paid for — a
   * content pipeline whose prompt you cannot read is one you cannot review.
   */
  async buildTopicBriefRequest(
    facetTypeOrSlug: string,
    themeSlug: string,
    options: {
      languageCode?: string;
      model?: string;
      overwrite?: boolean;
    } = {},
  ): Promise<
    | { status: "ready"; instructions: string; input: string; model: string }
    | TopicBriefResult
  > {
    const prepared = await this.prepareTopicBriefInput(
      facetTypeOrSlug,
      themeSlug,
      options,
    );
    if ("status" in prepared) return prepared;
    const system = await this.getSystemPrompt();
    return {
      status: "ready",
      instructions: system.text,
      input: prepared.input,
      model: options.model ?? DEFAULT_MODEL,
    };
  }

  /**
   * Everything after the model call: the same gates, then the write. Separate
   * from the call itself so a brief generated any other way — a batch job, a
   * re-run over a stored response — is held to an identical standard.
   */
  async acceptTopicBrief(
    facetTypeOrSlug: string,
    themeSlug: string,
    outputText: string,
    model: string,
    options: { languageCode?: string } = {},
  ): Promise<TopicBriefResult> {
    const languageCode = options.languageCode ?? DEFAULT_LANGUAGE;

    // Re-resolved rather than threaded through, so this stays usable on a
    // response that arrives long after the request was built.
    const prepared = await this.prepareTopicBriefInput(
      facetTypeOrSlug,
      themeSlug,
      { languageCode, overwrite: true },
    );
    if ("status" in prepared) return prepared;

    const system = await this.getSystemPrompt();
    const bookNames = await this.getBookNames();
    const chapterCounts = await this.getChapterCounts();

    const content = outputText.trim();
    const issues = validateTopicBrief({
      content,
      bookNames,
      chapterCounts,
      allowedReferences: prepared.allowedReferences,
      sourceText: prepared.sourceText,
    });

    if (issues.length) {
      // Rejected, not downgraded — the same rule the event layers follow.
      return {
        facetType: prepared.facetType,
        themeSlug,
        status: "rejected",
        issues,
      };
    }

    await this.events.saveTopicBrief({
      facetType: prepared.facetType,
      themeId: prepared.themeId,
      content,
      languageCode,
      provenance: TOPIC_BRIEF_PROVENANCE,
      promptId: system.id,
      model,
    });

    return {
      facetType: prepared.facetType,
      themeSlug,
      status: "saved",
      chars: content.length,
    };
  }

  /**
   * The (category, theme) pairs that have anything to describe.
   *
   * Derived from the corpus rather than from the cross product: most categories
   * touch a handful of themes, and asking for a brief about a topic a category
   * never addresses would produce prose about nothing.
   */
  async listTopicBriefTargets(
    languageCode = DEFAULT_LANGUAGE,
  ): Promise<Array<{ facetType: JesusFacetType; themeSlug: string }>> {
    const themes = await this.taxonomy.getThemes(languageCode);
    const targets: Array<{ facetType: JesusFacetType; themeSlug: string }> = [];

    for (const facetType of JESUS_FACET_TYPES) {
      const filter = this.eventService.facetFilter([facetType]);
      for (const theme of themes) {
        const count = await this.events.countEvents({
          ...filter,
          themeSlug: theme.slug,
        });
        if (count > 0) targets.push({ facetType, themeSlug: theme.slug });
      }
    }

    return targets;
  }

  /**
   * The verse text the model is allowed to reason from — the same text the
   * reader sees, in the same version, read from the database.
   */
  private async loadPassageText(
    eventSlug: string,
    bibleVersion: string,
    languageCode: string,
  ): Promise<PassageWithVerses[]> {
    const detail = await this.eventService.getEvent(
      eventSlug,
      languageCode,
      bibleVersion,
    );
    return (detail?.passages ?? []) as PassageWithVerses[];
  }
}

/** Models sometimes wrap JSON in a fence despite being asked not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
