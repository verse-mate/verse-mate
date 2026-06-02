/**
 * Seed/upsert the deterministic study term dictionary (study_term_translations,
 * migration 20260602100000). Covers the closed-vocabulary label fields the AI
 * translate batch occasionally leaks back in English:
 *
 *   pill          — the 9 observation tags, universal across all 1,189 studies
 *   contrast_type — Contrast / Comparison / Metaphor / Comparison/Contrast / Irony
 *   list_column   — Verse / Truth / Marker of falsehood / Promise
 *   book_name     — for the study title ("James 2" → "Iacov 2")
 *
 * Adding a language = add a block below + re-run. Adding a new term/type = add a
 * row. The applier (study-term-dictionary.ts) is generic, so no code changes.
 *
 *   bun src/actions/seed-study-terms.ts            # upsert all
 *   bun src/actions/seed-study-terms.ts --lang uk  # one language
 *
 * NOTE: pt-BR/uk/ru and the register-sensitive choices (e.g. ru EYES, ro
 * POSTURE) are first-pass — review and correct in-DB; no redeploy needed.
 */
import { db } from "../database";

type Terms = {
  pill: Record<string, string>;
  contrast_type: Record<string, string>;
  list_column: Record<string, string>;
  book_name: Record<string, string>;
};

const PILL_KEYS = [
  "POSTURE",
  "EYES",
  "WILL",
  "WHO",
  "TO WHOM",
  "WHEN",
  "WHERE",
  "WHY",
  "HOW",
];

const DICT: Record<string, Terms> = {
  "ro-RO": {
    pill: zip(PILL_KEYS, [
      "ATITUDINE",
      "OCHI",
      "VOINȚĂ",
      "CINE",
      "CĂTRE CINE",
      "CÂND",
      "UNDE",
      "DE CE",
      "CUM",
    ]),
    contrast_type: {
      Contrast: "Contrast",
      Comparison: "Comparație",
      Metaphor: "Metaforă",
      "Comparison/Contrast": "Comparație/Contrast",
      Irony: "Ironie",
    },
    list_column: {
      Verse: "Verset",
      Truth: "Adevăr",
      "Marker of falsehood": "Semn al falsității",
      Promise: "Promisiune",
    },
    book_name: { James: "Iacov" },
  },
  "es-MX": {
    pill: zip(PILL_KEYS, [
      "POSTURA",
      "OJOS",
      "VOLUNTAD",
      "QUIÉN",
      "A QUIÉN",
      "CUÁNDO",
      "DÓNDE",
      "POR QUÉ",
      "CÓMO",
    ]),
    contrast_type: {
      Contrast: "Contraste",
      Comparison: "Comparación",
      Metaphor: "Metáfora",
      "Comparison/Contrast": "Comparación/Contraste",
      Irony: "Ironía",
    },
    list_column: {
      Verse: "Versículo",
      Truth: "Verdad",
      "Marker of falsehood": "Señal de falsedad",
      Promise: "Promesa",
    },
    book_name: { James: "Santiago" },
  },
  "pt-BR": {
    pill: zip(PILL_KEYS, [
      "POSTURA",
      "OLHOS",
      "VONTADE",
      "QUEM",
      "A QUEM",
      "QUANDO",
      "ONDE",
      "POR QUÊ",
      "COMO",
    ]),
    contrast_type: {
      Contrast: "Contraste",
      Comparison: "Comparação",
      Metaphor: "Metáfora",
      "Comparison/Contrast": "Comparação/Contraste",
      Irony: "Ironia",
    },
    list_column: {
      Verse: "Versículo",
      Truth: "Verdade",
      "Marker of falsehood": "Marca de falsidade",
      Promise: "Promessa",
    },
    book_name: { James: "Tiago" },
  },
  uk: {
    pill: zip(PILL_KEYS, [
      "ПОЗА",
      "ОЧІ",
      "ВОЛЯ",
      "ХТО",
      "КОМУ",
      "КОЛИ",
      "ДЕ",
      "ЧОМУ",
      "ЯК",
    ]),
    contrast_type: {
      Contrast: "Контраст",
      Comparison: "Порівняння",
      Metaphor: "Метафора",
      "Comparison/Contrast": "Порівняння/Контраст",
      Irony: "Іронія",
    },
    list_column: {
      Verse: "Вірш",
      Truth: "Істина",
      "Marker of falsehood": "Ознака неправди",
      Promise: "Обітниця",
    },
    book_name: { James: "Якова" },
  },
  ru: {
    pill: zip(PILL_KEYS, [
      "ПОЗА",
      "ВЗГЛЯД",
      "ВОЛЯ",
      "КТО",
      "КОМУ",
      "КОГДА",
      "ГДЕ",
      "ПОЧЕМУ",
      "КАК",
    ]),
    contrast_type: {
      Contrast: "Контраст",
      Comparison: "Сравнение",
      Metaphor: "Метафора",
      "Comparison/Contrast": "Сравнение/Контраст",
      Irony: "Ирония",
    },
    list_column: {
      Verse: "Стих",
      Truth: "Истина",
      "Marker of falsehood": "Признак лжи",
      Promise: "Обещание",
    },
    book_name: { James: "Иакова" },
  },
};

function zip(keys: string[], vals: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  keys.forEach((k, i) => {
    o[k] = vals[i];
  });
  return o;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--lang");
  return { onlyLang: i !== -1 && args[i + 1] ? args[i + 1] : undefined };
}

async function main() {
  const { onlyLang } = parseArgs();
  const conn = db.getOrCreateConnection();
  const langs = Object.keys(DICT).filter((l) => !onlyLang || l === onlyLang);
  if (langs.length === 0) {
    console.error(`No dictionary for --lang ${onlyLang}`);
    process.exit(1);
  }

  let total = 0;
  for (const lang of langs) {
    const t = DICT[lang];
    const rows: {
      language_code: string;
      term_type: string;
      source_en: string;
      target_term: string;
    }[] = [];
    for (const term_type of Object.keys(t) as (keyof Terms)[]) {
      for (const [source_en, target_term] of Object.entries(t[term_type])) {
        rows.push({ language_code: lang, term_type, source_en, target_term });
      }
    }
    for (const r of rows) {
      await conn
        .insertInto("study_term_translations")
        .values({ ...r, is_active: true })
        .onConflict((oc) =>
          oc.columns(["language_code", "term_type", "source_en"]).doUpdateSet({
            target_term: r.target_term,
            is_active: true,
            updated_at: new Date(),
          }),
        )
        .execute();
    }
    total += rows.length;
    console.log(`  ${lang}: upserted ${rows.length} terms`);
  }
  console.log(`Done — ${total} term(s) across ${langs.length} language(s).`);
  await db.closeConnection();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
