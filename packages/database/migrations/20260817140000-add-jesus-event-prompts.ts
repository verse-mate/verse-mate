import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

/**
 * Prompt templates for Jesus event content.
 *
 * These are the *task* prompts only. The theological framework comes from the
 * existing `prompts` row with `prompt_type = 'system'` — the same one behind
 * every other explanation in VerseMate — so the Jesus feature cannot end up
 * reading as though a different theology wrote it. Nothing about Swindoll,
 * Spurgeon, the moral law or the ordinances is restated here; that would fork
 * the guidance and let the two drift.
 *
 * Placeholders filled by JesusGenerationService:
 *   {event_title} {event_summary} {gospel_accounts} {passages}
 *   {facets} {themes} {period} {allowed_types}
 *
 * `{passages}` is the actual verse text from the database in the reader's
 * version. Every prompt below is explicit that it is the only permitted source,
 * because the validation gates check the output against exactly that string.
 */

const TEMPLATES: Array<{
  name: string;
  type: string;
  template: string;
}> = [
  {
    name: "Jesus Event — Overview",
    type: "jesus-event-overview",
    template: `Write the Overview for a Gospel event in a Bible study app.

EVENT: {event_title}
ACCOUNTS: {gospel_accounts}
PERIOD: {period}
THEMES: {themes}

PASSAGE TEXT (your only source — do not rely on memory):
{passages}

Write 150–250 words of plain prose covering:
- the setting: where, when, who is present
- what happens, in order
- what the event shows about Jesus

Rules:
- Use ONLY the supplied passage text. Do not cite chapters or books other than the accounts listed above.
- Observation before interpretation: describe what the text says before drawing conclusions from it.
- Do not quote at length. Reference verses rather than reproducing them; the app renders the passage itself alongside this.
- No headings, no bullet lists, no preamble. Begin with the first sentence of the overview.`,
  },
  {
    name: "Jesus Event — Compare",
    type: "jesus-event-compare",
    template: `Compare the Gospel accounts of a single event for a Bible study app.

EVENT: {event_title}
ACCOUNTS: {gospel_accounts}

PASSAGE TEXT (your only source — do not rely on memory):
{passages}

Write 100–200 words explaining how the accounts differ in emphasis:
- what all the accounts share
- what each account includes that the others do not
- what each writer appears to be emphasizing

Rules:
- Use ONLY the supplied passage text. Do not cite chapters or books other than the accounts listed above.
- Base every difference on something actually present or actually absent in the text above. Do not speculate about a writer's sources or dating.
- If the accounts are near-identical, say so plainly rather than manufacturing contrast.
- No headings, no preamble. Begin with the first sentence.`,
  },
  {
    name: "Jesus Event — Insights",
    type: "jesus-event-insights",
    template: `Write the Insights section for a Gospel event in a Bible study app.

EVENT: {event_title}
ACCOUNTS: {gospel_accounts}
THEMES: {themes}

CATALOGUED WORDS AND ACTIONS:
{facets}

PASSAGE TEXT:
{passages}

Write 200–350 words covering:
- what this event reveals about Jesus' identity, mission or teaching
- how it connects to the wider witness of Scripture
- any original-language detail that genuinely changes the reading (omit entirely if there is none — do not manufacture one)

Rules:
- This section is interpretation, not observation. Keep assertions traceable to the passage or to Scripture you cite explicitly.
- Where interpretations among scholars who uphold biblical authority genuinely differ, say so briefly rather than presenting one reading as settled.
- Do not moralize and do not address the reader as "you" here; application is a separate section.
- No headings, no preamble.`,
  },
  {
    name: "Jesus Event — Application",
    type: "jesus-event-application",
    template: `Write application questions for a Gospel event in a Bible study app.

EVENT: {event_title}
PASSAGE TEXT:
{passages}

Write exactly 4 questions, one per line, no numbering and no preamble.

Each question must ask what the passage requires — for example what it calls the reader to believe about Christ, what response it expects, whether there is a command to obey, or an assumption of ours that it contradicts.

Do NOT write questions about feelings ("how does this make you feel"), and do not write questions that could be asked of any passage. Each one must be answerable only from this event.`,
  },
  {
    name: "Jesus Event — Facet extraction",
    type: "jesus-event-extraction",
    template: `Extract the words and actions of Jesus from a Gospel passage.

EVENT: {event_title}

PASSAGE TEXT (your ONLY source):
{passages}

Return STRICT JSON, no prose and no code fence:

{"facets":[{"mode":"WORD|ACTION","type":"<type>","speaker":"JESUS|DISCIPLE|CROWD|OPPONENT|NARRATOR|FATHER","actor":"JESUS|...","title":"short label","text":"exact quotation for WORD facets, else null","reference":"Book C:V"}]}

Allowed types: {allowed_types}

Rules — these are checked mechanically and a record that breaks them is discarded:
- Extract ONLY what is explicitly present in the passage above. Do not add anything you know from elsewhere.
- For a WORD facet, "text" MUST be an exact quotation copied from the passage. Do not paraphrase, modernize or reconstruct it. Use an ellipsis (…) to skip material within a quotation.
- A WORD facet requires "speaker". An ACTION facet requires "actor".
- Record actions as well as speech: what Jesus did, touched, went to, felt, refused. A passage where He acts without speaking still yields facets.
- Do not merge several sayings into one facet, and do not split a single sentence across facets.
- If the passage contains no words or actions of Jesus, return {"facets":[]}.`,
  },
];

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding Jesus event prompt templates...");

  for (const entry of TEMPLATES) {
    await db
      .insertInto("user_prompt_templates")
      .values({
        template_name: entry.name,
        explanation_type: entry.type,
        prompt_template: entry.template,
        status: "active",
      })
      .onConflict((oc) =>
        oc.column("explanation_type").doUpdateSet({
          template_name: entry.name,
          prompt_template: entry.template,
          status: "active",
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  console.log(`Added ${TEMPLATES.length} Jesus event prompt templates.`);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db
    .deleteFrom("user_prompt_templates")
    .where(
      "explanation_type",
      "in",
      TEMPLATES.map((t) => t.type),
    )
    .execute();
}
