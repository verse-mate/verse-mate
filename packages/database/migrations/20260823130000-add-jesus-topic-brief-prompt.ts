import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

/**
 * The prompt behind a topic brief.
 *
 * As with the event templates, this is the *task* prompt only — the
 * theological framework comes from the shared `system` prompt row, so a brief
 * cannot read as though a different theology wrote it.
 *
 * Placeholders filled by JesusGenerationService.prepareTopicBriefInput:
 *   {category_label} {category_singular} {category_plural} {category_mode}
 *   {topic_name} {topic_description} {sayings} {event_count} {accounts}
 *
 * `{sayings}` is the real list of facets from the database for this
 * (category × theme) pair — titles, quotations and references. It is the only
 * permitted source, and the output is checked back against it: a quotation the
 * brief invents is rejected rather than stored.
 */

const TEMPLATE_TYPE = "jesus-topic-brief";
const TEMPLATE_NAME = "Jesus Topic — Brief";

const TEMPLATE = `Write the standfirst for one topic inside a category of a Bible study app.

The app groups everything Jesus {category_mode} into categories. The reader is
looking at the {category_label} category, at the section for one topic. Your job
is the paragraph directly under that topic's heading: what He {category_mode}
about this topic, as opposed to what the topic is in general.

CATEGORY: {category_label} (one of these is a "{category_singular}")
TOPIC: {topic_name}
WHAT THE TOPIC MEANS GENERALLY: {topic_description}
COVERAGE: {event_count} event(s), across {accounts}

HIS {category_plural} ON THIS TOPIC (your only source — do not rely on memory):
{sayings}

Write 2–3 sentences, 45–90 words, of plain prose:
- Lead with the substance: what He actually {category_mode} about this topic across these
  entries, in your own words.
- Name what recurs — the same demand, the same reversal, the same promise — and
  what stands out as unusual within it.
- End on what it asks of the reader, only if the entries themselves support it.

Rules — these are checked mechanically and a brief that breaks them is discarded:
- Use ONLY the entries above. Do not cite a book or chapter that does not appear in them.
- Do NOT restate the general meaning of the topic. The reader has that line already;
  repeating it wastes the paragraph.
- Quotation marks are a claim that He said those exact words. Only quote text that
  appears verbatim in an entry above, and keep it short. When in doubt, paraphrase
  without quotation marks.
- Do not count or enumerate the entries ("in these eight teachings…"). The screen shows the count.
- No headings, no bullet lists, no preamble. Begin with the first sentence.`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("user_prompt_templates")
    .values({
      template_name: TEMPLATE_NAME,
      explanation_type: TEMPLATE_TYPE,
      prompt_template: TEMPLATE,
      status: "active",
    })
    .onConflict((oc) =>
      oc.column("explanation_type").doUpdateSet({
        template_name: TEMPLATE_NAME,
        prompt_template: TEMPLATE,
        status: "active",
        updated_at: new Date(),
      }),
    )
    .execute();

  console.log("Added the Jesus topic-brief prompt template.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db
    .deleteFrom("user_prompt_templates")
    .where("explanation_type", "=", TEMPLATE_TYPE)
    .execute();
}
