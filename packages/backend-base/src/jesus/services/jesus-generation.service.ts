import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { type AiProvider, getAiProvider } from "../../shared/ai";
import type { db } from "../../shared/shared.plugin";
import {
  JESUS_FACET_TYPES,
  JESUS_PROVENANCE,
  type JesusEventExplanationType,
} from "../jesus.constants";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import {
  type ExtractedFacet,
  type ValidationIssue,
  referenceKey,
  validateExtraction,
  validateNarrative,
} from "../utils/generation-validation";
import { JesusEventService } from "./jesus-event.service";

const DEFAULT_MODEL = "gpt-5";

/**
 * Shared by the synchronous and batched paths so a batched record is generated
 * under exactly the same settings as a synchronous one — otherwise "we batched
 * it" would quietly mean "we generated it differently".
 */
export const GENERATION_REASONING_EFFORT = "medium" as const;
export const GENERATION_MAX_OUTPUT_TOKENS = 8000;
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
    this.prompts = new PromptRepository(this.db);
    this.templates = new UserPromptRepository(this.db);
  }

  /**
   * The theological framework every other explanation in VerseMate is written
   * against. Reused verbatim so Jesus content cannot drift from the rest.
   */
  private async getSystemPrompt(): Promise<{ id: number; text: string }> {
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

    const input = template
      .replace("{event_title}", event.title)
      .replace("{event_summary}", event.summary ?? "")
      .replace(
        "{gospel_accounts}",
        event.passages.map((p) => p.display).join(" · "),
      )
      .replace("{passages}", passageBlock)
      .replace("{facets}", facetLines || "(none catalogued)")
      .replace(
        "{themes}",
        event.themes.map((t) => t.name).join(", ") || "(none)",
      )
      .replace("{period}", event.period_name ?? "(unplaced)");

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
    const allowed = new Set(
      event.passages.map((p) => referenceKey(p.book_name, p.chapter)),
    );

    const issues = validateNarrative({
      content: response.outputText,
      type,
      bookNames,
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
    const input = template
      .replace("{event_title}", event.title)
      .replace("{passages}", this.renderPassages(passages))
      .replace("{allowed_types}", JESUS_FACET_TYPES.join(" | "));

    const response = await this.ai.responsesCreate({
      model,
      instructions: system.text,
      input,
      reasoningEffort: "medium",
      maxOutputTokens: 8000,
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
