/**
 * Seed/upsert inductive-study UI chrome labels into `study_labels` (see
 * migration 20260602000000).
 *
 * These are the fixed labels that wrap the study renderer (section headings,
 * "About …" collapsibles, Movement/Verses/Chapter-theme, Expand/Collapse).
 * Moving them to the DB means a new language goes live in web + mobile on the
 * next fetch — no rebuild/release. The clients keep the bundled
 * `@versemate/studies` map (en/ro/es) as the offline/default fallback and
 * merge the fetched row over it, so missing keys degrade to English per-key.
 *
 * Idempotent: keyed on `language_code`, re-running updates `labels`.
 *
 *   bun src/actions/seed-study-labels.ts            # upsert all languages
 *   bun src/actions/seed-study-labels.ts --lang pt-BR   # just one
 *
 * en/ro/es mirror the reviewed bundled package (`labels.ts`). pt-BR/uk/ru are
 * first-pass translations to be QA'd; correcting one is now a single DB
 * update, not a release.
 */
import { db } from "../database";

interface StudyLabels {
  inductiveStudyOf: string;
  observationSection: string;
  aboutObservationTitle: string;
  aboutObservationBody: string;
  interpretationSection: string;
  aboutInterpretationTitle: string;
  movement: string;
  applicationSection: string;
  applyOneQuestion: string;
  versesLabel: string;
  chapterThemeLabel: string;
  expandAll: string;
  collapseAll: string;
}

// Keyed by the BCP-47 code stored in `explanation_languages` (the settings
// dropdown). The endpoint family-matches a request ("ro" → "ro-RO").
const LABELS: Record<string, StudyLabels> = {
  "ro-RO": {
    inductiveStudyOf: "Studiu inductiv —",
    observationSection: "Observație — 9 pași inductivi",
    aboutObservationTitle: "Despre cei nouă pași de observație",
    aboutObservationBody:
      "Observația întreabă ce *spune* textul — încetinind pentru a marca cuvintele-cheie, contrastele, repetițiile și indiciile structurale pe care autorul ți le-a lăsat. Fiecare dintre cei nouă pași de mai jos construiește dovezile pe care se sprijină interpretarea care urmează. Nu sări înainte; sensul vine din ceea ce ai observat.",
    interpretationSection: "Interpretare",
    aboutInterpretationTitle: "Despre mișcările de interpretare",
    movement: "Mișcarea",
    applicationSection: "Aplicație",
    applyOneQuestion: "Aplică — o întrebare pentru fiecare mișcare",
    versesLabel: "Versete",
    chapterThemeLabel: "Tema capitolului",
    expandAll: "Extinde tot",
    collapseAll: "Restrânge tot",
  },
  "es-MX": {
    inductiveStudyOf: "Estudio inductivo de",
    observationSection: "Observación — 9 pasos inductivos",
    aboutObservationTitle: "Sobre los nueve pasos de observación",
    aboutObservationBody:
      "La observación pregunta qué *dice* el texto — deteniéndose para marcar las palabras clave, los contrastes, las repeticiones y las señales estructurales que el autor dejó para ti. Cada uno de los nueve pasos siguientes construye la evidencia sobre la que se basa la interpretación que sigue. No te adelantes; el significado proviene de lo que observaste.",
    interpretationSection: "Interpretación",
    aboutInterpretationTitle: "Sobre los movimientos de interpretación",
    movement: "Movimiento",
    applicationSection: "Aplicación",
    applyOneQuestion: "Aplica, una pregunta por movimiento",
    versesLabel: "Versículos",
    chapterThemeLabel: "Tema del capítulo",
    expandAll: "Expandir todo",
    collapseAll: "Contraer todo",
  },
  "pt-BR": {
    inductiveStudyOf: "Estudo indutivo de",
    observationSection: "Observação — 9 passos indutivos",
    aboutObservationTitle: "Sobre os nove passos de observação",
    aboutObservationBody:
      "A observação pergunta o que o texto *diz* — desacelerando para marcar as palavras-chave, os contrastes, as repetições e as pistas estruturais que o autor deixou para você. Cada um dos nove passos abaixo constrói as evidências sobre as quais se baseia a interpretação que segue. Não pule adiante; o significado vem daquilo que você observou.",
    interpretationSection: "Interpretação",
    aboutInterpretationTitle: "Sobre os movimentos de interpretação",
    movement: "Movimento",
    applicationSection: "Aplicação",
    applyOneQuestion: "Aplique — uma pergunta por movimento",
    versesLabel: "Versículos",
    chapterThemeLabel: "Tema do capítulo",
    expandAll: "Expandir tudo",
    collapseAll: "Recolher tudo",
  },
  uk: {
    inductiveStudyOf: "Індуктивне вивчення —",
    observationSection: "Спостереження — 9 індуктивних кроків",
    aboutObservationTitle: "Про дев’ять кроків спостереження",
    aboutObservationBody:
      "Спостереження запитує, що текст *говорить* — сповільнюючись, щоб позначити ключові слова, контрасти, повтори та структурні підказки, які залишив автор. Кожен із дев’яти кроків нижче формує докази, на яких ґрунтується подальше тлумачення. Не забігайте вперед; зміст випливає з того, що ви спостерегли.",
    interpretationSection: "Тлумачення",
    aboutInterpretationTitle: "Про рухи тлумачення",
    movement: "Рух",
    applicationSection: "Застосування",
    applyOneQuestion: "Застосуйте — одне запитання на кожен рух",
    versesLabel: "Вірші",
    chapterThemeLabel: "Тема розділу",
    expandAll: "Розгорнути все",
    collapseAll: "Згорнути все",
  },
  ru: {
    inductiveStudyOf: "Индуктивное изучение —",
    observationSection: "Наблюдение — 9 индуктивных шагов",
    aboutObservationTitle: "О девяти шагах наблюдения",
    aboutObservationBody:
      "Наблюдение спрашивает, что текст *говорит* — замедляясь, чтобы отметить ключевые слова, противопоставления, повторы и структурные подсказки, которые оставил автор. Каждый из девяти шагов ниже выстраивает доказательства, на которых основано последующее толкование. Не забегайте вперёд; смысл рождается из того, что вы наблюдали.",
    interpretationSection: "Толкование",
    aboutInterpretationTitle: "О движениях толкования",
    movement: "Движение",
    applicationSection: "Применение",
    applyOneQuestion: "Примените — один вопрос на каждое движение",
    versesLabel: "Стихи",
    chapterThemeLabel: "Тема главы",
    expandAll: "Развернуть всё",
    collapseAll: "Свернуть всё",
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--lang");
  return { onlyLang: i !== -1 && args[i + 1] ? args[i + 1] : undefined };
}

async function main() {
  const { onlyLang } = parseArgs();
  const conn = db.getOrCreateConnection();
  const entries = Object.entries(LABELS).filter(
    ([code]) => !onlyLang || code === onlyLang,
  );
  if (entries.length === 0) {
    console.error(`No labels defined for --lang ${onlyLang}`);
    process.exit(1);
  }

  for (const [language_code, labels] of entries) {
    await conn
      .insertInto("study_labels")
      .values({ language_code, labels, is_active: true })
      .onConflict((oc) =>
        oc.column("language_code").doUpdateSet({
          labels,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .execute();
    console.log(`  upserted study_labels: ${language_code}`);
  }

  console.log(`Done — ${entries.length} language(s) seeded.`);
  await db.closeConnection();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
