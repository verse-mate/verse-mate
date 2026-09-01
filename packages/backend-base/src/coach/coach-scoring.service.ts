import { sql } from "kysely";

import { type AiProvider, getAiProvider } from "../shared/ai";
import type { db } from "../shared/shared.plugin";
import {
  CLUSTERS,
  DIMENSIONS,
  RUBRIC_MODEL_VERSION,
  composeBaseScore,
  statusForScore,
} from "./rubric";
import {
  type RawDimensionScore,
  missingDimensions,
  validateDimensionScores,
} from "./scoring-validation";

/**
 * Automated per-dimension scoring (change: port-coach-pipeline, tasks 5.1, 5.5,
 * 5.6), modelled on `jesus-generation.service.ts` and reaching the model only
 * through the shared `AiProvider` interface — never `new OpenAI(...)`.
 *
 * The division of labour is deliberate and is what makes the score auditable:
 * **the model supplies twelve 1-5 judgements and a reason for each; code does
 * every piece of arithmetic.** A model asked for the composite would produce a
 * number nobody can reconstruct, and changing a cluster weight would then mean
 * re-prompting rather than editing one line (task 3.7).
 *
 * No operator need be present at any point.
 */

export const DEFAULT_SCORING_MODEL = "gpt-5";
const SCORING_MAX_OUTPUT_TOKENS = 8000;

export interface ScoringInput {
  reportId: string;
  /** Pseudonymous transcript lines — speakers numbered, never named (4.3a). */
  transcript: Array<{ speakerId: string; isLeader: boolean; text: string }>;
  sessionTitle: string;
}

export type ScoringFailure =
  | "model-returned-unparseable-output"
  | "model-output-rejected"
  | "model-omitted-dimensions";

export interface ScoringResult {
  ok: boolean;
  failure?: ScoringFailure;
  detail?: string;
  base?: number;
  clusters?: ReturnType<typeof composeBaseScore>["clusters"];
  status?: { label: string; emoji: string };
  /** The rubric version these scores were produced under (task 5.5). */
  modelVersion?: string;
}

export class CoachScoringService {
  private readonly ai: AiProvider;

  constructor(
    private readonly db: db,
    ai?: AiProvider,
    private readonly model: string = DEFAULT_SCORING_MODEL,
  ) {
    this.ai = ai ?? getAiProvider();
  }

  /**
   * The instruction. Built from the rubric rather than restated in prose, so a
   * dimension's description or target changing in one place changes what the
   * model is asked (task 3.7's single-source property, extended to the prompt).
   */
  static buildInstructions(): string {
    const dims = DIMENSIONS.map(
      (d) =>
        `${d.n}. ${d.name} — ${d.what}\n   Research-backed target: ${d.target}\n   Cluster: ${d.cluster}`,
    ).join("\n");
    const clusters = CLUSTERS.map((c) => `${c.name} (${c.weight} points)`).join(
      ", ",
    );
    return [
      `You are scoring one Bible-study session against the ${RUBRIC_MODEL_VERSION} rubric.`,
      "",
      `Weighted clusters: ${clusters}.`,
      "",
      "Score EACH of these twelve dimensions from 1 to 5 (whole numbers):",
      dims,
      "",
      "Rules you must follow:",
      "- Give every dimension a rationale citing what in the session led to the score.",
      "- If the session gives you no evidence for a dimension, set score to null",
      "  and say why. Do NOT guess and do NOT score it low — a low score is a",
      "  claim about the leader, and absence of evidence is not evidence of absence.",
      "- Do not compute a total, a percentage or a composite. Scores and reasons only.",
      "",
      'Return JSON: {"dimensions":[{"n":1,"score":4,"rationale":"..."}, ...]}',
    ].join("\n");
  }

  async scoreSession(input: ScoringInput): Promise<ScoringResult> {
    const transcript = input.transcript
      .map((l) => `${l.isLeader ? "LEADER" : l.speakerId}: ${l.text}`)
      .join("\n");

    const response = await this.ai.chatComplete({
      model: this.model,
      messages: [
        { role: "system", content: CoachScoringService.buildInstructions() },
        {
          role: "user",
          content: `Session: ${input.sessionTitle}\n\n${transcript}`,
        },
      ],
      maxTokens: SCORING_MAX_OUTPUT_TOKENS,
      responseFormat: { type: "json_object" },
    });

    let raw: RawDimensionScore[];
    try {
      const parsed = JSON.parse(response.content) as {
        dimensions?: RawDimensionScore[];
      };
      raw = parsed.dimensions ?? [];
    } catch (error) {
      return {
        ok: false,
        failure: "model-returned-unparseable-output",
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const validated = validateDimensionScores(raw);
    if (!validated.ok) {
      return {
        ok: false,
        failure: "model-output-rejected",
        detail: validated.issues.map((i) => i.detail).join("; "),
      };
    }

    // Silence is not not-applicable. An omitted dimension would shrink its
    // cluster's denominator and inflate the composite — the leader would be
    // rewarded for the model's omission.
    const missing = missingDimensions(
      validated.scores as Map<number, number | null>,
    );
    if (missing.length > 0) {
      return {
        ok: false,
        failure: "model-omitted-dimensions",
        detail: `no judgement for dimension(s) ${missing.join(", ")}`,
      };
    }

    // Every number below is computed here, from the rubric definition.
    const { base, clusters } = composeBaseScore(
      validated.scores as Map<number, number | null>,
    );

    await this.persist(
      input.reportId,
      validated.scores as Map<number, number | null>,
      validated.rationales as Map<number, string>,
    );

    return {
      ok: true,
      base,
      clusters,
      status: statusForScore(base),
      modelVersion: RUBRIC_MODEL_VERSION,
    };
  }

  /**
   * Write machine scores, PRESERVING human corrections (task 5.6).
   *
   * The `WHERE provenance = 'machine'` on the update is the whole guarantee: a
   * re-score refreshes what the model produced and leaves an admin's correction
   * standing. Without it a re-run silently discards human judgement, and the
   * admin has no way to know it happened.
   */
  private async persist(
    reportId: string,
    scores: ReadonlyMap<number, number | null>,
    rationales: ReadonlyMap<number, string>,
  ): Promise<void> {
    const conn = this.db.getOrCreateConnection();
    for (const [n, score] of scores) {
      await sql`
        INSERT INTO coach_report_dimension_scores
          (report_id, dimension_n, score, rationale, provenance, model_version)
        VALUES (
          ${reportId}, ${n}, ${score}, ${rationales.get(n) ?? ""},
          'machine', ${RUBRIC_MODEL_VERSION}
        )
        ON CONFLICT (report_id, dimension_n) DO UPDATE SET
          score         = EXCLUDED.score,
          rationale     = EXCLUDED.rationale,
          model_version = EXCLUDED.model_version,
          updated_at    = NOW()
        WHERE coach_report_dimension_scores.provenance = 'machine'
      `.execute(conn);
    }
  }
}
