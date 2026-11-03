import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

/**
 * Prompt template for the cross-Gospel event study (`jesus-event-study`).
 *
 * The app's inductive studies are written per chapter, so a Jesus event told
 * by several Gospels could only be studied one chapter at a time ("Cleansing
 * of the temple study also only shows Matthew detail"). This layer is one
 * Precept study of the EVENT, reading every account together.
 *
 * Like every Jesus event template it is a task prompt only — the theological
 * framework is the shared `system` prompt — and `{passages}` is the verse text
 * from the database, the only permitted source. The output is JSON in the
 * `@versemate/studies` InductiveStudy shape (minus header fields, which the
 * service fills), checked by `validateEventStudy` before it is stored:
 * nine steps of fixed kinds, Gospel references inside the event's accounts,
 * and every quotation present in the supplied passages.
 */
const TEMPLATE = {
  name: "Jesus Event — Study across the Gospels",
  type: "jesus-event-study",
  template: `Write one inductive Bible study (the Precept method) of a Gospel event, reading ALL of its accounts together.

EVENT: {event_title}
SUMMARY: {event_summary}
ACCOUNTS: {gospel_accounts}
PERIOD: {period}
THEMES: {themes}

PASSAGE TEXT (your only source for the event — do not rely on memory):
{passages}

This is a study of the EVENT, not of any one chapter. Every step draws on every account above, and says which account each observation comes from. Where the accounts differ — what one includes and another omits, a different order, setting or emphasis — observe it plainly; do not harmonise a difference away and do not invent one.

Return STRICT JSON, no prose before or after, no code fence, in exactly this shape:

{
  "themeOneLine": "one line, in the text's own words where possible",
  "steps": [
    {"number": 1, "kind": "bullets", "title": "Begin with prayer", "summary": "...", "items": [{"tag": "POSTURE", "text": "..."}, {"tag": "EYES", "text": "..."}, {"tag": "WILL", "text": "..."}]},
    {"number": 2, "kind": "qa", "title": "Ask the 5 W's and an H", "summary": "...", "items": [{"tag": "WHO", "q": "...", "a": "..."}, {"tag": "WHAT", "q": "...", "a": "..."}, {"tag": "WHEN", "q": "...", "a": "..."}, {"tag": "WHERE", "q": "...", "a": "..."}, {"tag": "WHY", "q": "...", "a": "..."}, {"tag": "HOW", "q": "...", "a": "..."}]},
    {"number": 3, "kind": "keywords", "title": "Mark key words and phrases", "summary": "...", "inventory": [{"word": "...", "greek": "transliteration", "count": 2, "verses": "Mark 11:17; John 2:16", "definition": "..."}]},
    {"number": 4, "kind": "lists", "title": "Make lists", "summary": "...", "lists": [{"title": "What Jesus does", "columns": ["Verse", "Truth"], "rows": [{"ref": "Matthew 21:12", "truth": "..."}]}]},
    {"number": 5, "kind": "contrasts", "title": "Watch for contrasts and comparisons", "summary": "...", "items": [{"verses": "Matthew 21:13 · John 2:16", "type": "Comparison", "pairing": "..."}]},
    {"number": 6, "kind": "bullets", "title": "Note expressions of time", "summary": "...", "items": [{"tag": "John 2:13", "text": "..."}]},
    {"number": 7, "kind": "bullets", "title": "Mark geographic locations", "summary": "...", "items": [{"tag": "Mark 11:15", "text": "..."}]},
    {"number": 8, "kind": "bullets", "title": "Mark terms of conclusion", "summary": "...", "items": [{"tag": "Luke 19:47", "text": "..."}]},
    {"number": 9, "kind": "segments", "title": "Identify the theme", "summary": "...", "themeHeadline": "...", "segments": [{"title": "...", "body": "..."}]}
  ],
  "interpretation": {
    "intro": "...",
    "movements": [{"title": "...", "range": "Mark 11:15-17", "excerpt": "...", "body": "markdown"}]
  },
  "application": {
    "questions": [{"range": "John 2:19-22", "question": "..."}]
  }
}

Rules — these are checked mechanically and a study that breaks them is discarded:
- All nine steps, numbered 1–9, each with exactly the "kind" shown. Every array non-empty.
- Every Gospel reference names its book ("Mark 11:17", never "11:17") and stays inside the accounts listed above. Other scripture (the prophets He quotes, for example) may be cited by reference, but never quoted.
- Anything in double quotation marks must be copied exactly from the passage text above. Paraphrase without quotation marks instead.
- Step 5 includes at least one comparison BETWEEN the accounts.
- Interpretation: 2–5 movements through the event. At least one says how the accounts relate — what each one's telling brings out.
- Application: 4–6 questions, each asking what the passage requires (what to believe about Christ, what response it calls for, a command to obey, an assumption it contradicts). No questions about feelings, none that could be asked of any passage.
- Observation before interpretation: steps 1–9 describe what the text says; conclusions belong in the movements.`,
};

export async function up(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("user_prompt_templates")
    .values({
      template_name: TEMPLATE.name,
      explanation_type: TEMPLATE.type,
      prompt_template: TEMPLATE.template,
      status: "active",
    })
    .onConflict((oc) =>
      oc.column("explanation_type").doUpdateSet({
        template_name: TEMPLATE.name,
        prompt_template: TEMPLATE.template,
        status: "active",
        updated_at: new Date(),
      }),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db
    .deleteFrom("user_prompt_templates")
    .where("explanation_type", "=", TEMPLATE.type)
    .execute();
}
