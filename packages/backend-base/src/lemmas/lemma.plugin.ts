import { Elysia, t } from "elysia";
import { createErrorHandler } from "../common/error-handler";
import { NotFoundError } from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import { LemmaService } from "./services/lemma.service";

// Shared shape for a `related` cross-reference (mirrors RelatedWord on
// the Kysely model — re-declared inline so the schema stays self-contained
// for OpenAPI generation).
const RelatedWordSchema = t.Object({
  translit: t.String(),
  note: t.String(),
});

// Response shape for `GET /lemma/:strongs`. Frontend renders these
// directly — no further mapping. Translated fields fall back to the
// English baseline field-by-field, so the response is always
// renderable regardless of whether the requested language has a
// translation row.
const LemmaCardSchema = t.Object({
  strongs: t.String(),
  lemma: t.String(),
  translit: t.Union([t.String(), t.Null()]),
  pronunciation: t.Union([t.String(), t.Null()]),
  nt_frequency: t.Union([t.Number(), t.Null()]),
  ot_frequency: t.Union([t.Number(), t.Null()]),
  loaded: t.Boolean(),
  pos: t.Union([t.String(), t.Null()]),
  basic_gloss: t.Union([t.String(), t.Null()]),
  semantic_range: t.Union([t.Array(t.String()), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  related: t.Union([t.Array(RelatedWordSchema), t.Null()]),
  /**
   * Language actually represented by the payload. Equals the requested
   * `lang` query param when a translation row exists, else "en"
   * (English baseline fallback). Frontend can use this to render a
   * subtle "translated by AI" badge or skip it for English.
   */
  language_code: t.String(),
  /**
   * Origin of the translation — "llm:claude-haiku-4-5", "uw"
   * (unfoldingWord), "hand", or null when no translation row exists
   * (`is_translated: false`).
   */
  source: t.Union([t.String(), t.Null()]),
  is_translated: t.Boolean(),
});

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("lemma plugin"))
  .state((state) => ({
    ...state,
    lemmaService: new LemmaService(state.db),
  }))
  .group("/lemma", (app) =>
    app.get(
      "/:strongs",
      async ({ params, query, store: { lemmaService } }) => {
        // Canonicalize to the same `G####`/`H####` 4-digit-padded shape
        // the loader writes — case-insensitive incoming, output is the
        // exact PK we'd match in the DB.
        const raw = params.strongs.trim().toUpperCase();
        const m = raw.match(/^([GH])(\d+)$/);
        if (!m) {
          throw new NotFoundError(`Invalid Strong's number: ${params.strongs}`);
        }
        const strongs = `${m[1]}${Number.parseInt(m[2], 10).toString().padStart(4, "0")}`;

        const lang = (query.lang ?? "en").trim();
        const card = await lemmaService.getLemma(strongs, lang);
        if (!card) throw new NotFoundError(`Lemma not found: ${strongs}`);
        return card;
      },
      {
        params: t.Object({
          strongs: t.String({
            description:
              "Strong's number, e.g. G2385 or H0001. Case-insensitive; gets canonicalized to 4-digit zero-padded form server-side.",
          }),
        }),
        query: t.Object({
          lang: t.Optional(
            t.String({
              description:
                "ISO 639-1 language code (es, de, fr, ru, it, pt, ro, hi, tl, uk). Defaults to 'en'. Falls back to English baseline if no translation exists for the requested language.",
            }),
          ),
        }),
        response: {
          200: LemmaCardSchema,
          404: StandardErrorResponses[400],
          ...StandardErrorResponses,
        },
        detail: {
          tags: ["Lemma"],
          summary:
            "Get a lemma card (Strong's-keyed) in any supported language",
          description:
            "Returns the lemma metadata (Greek/Hebrew lemma, transliteration, frequency) plus the translatable cards (pos, basic_gloss, semantic_range, notes, related) in the requested language. English baseline on the `lemmas` row, non-English from `lemma_translations` with field-by-field fallback. 404 if Strong's number isn't in the loaded set.",
        },
      },
    ),
  );

export default plugin;
export type LemmaPlugin = typeof plugin;
