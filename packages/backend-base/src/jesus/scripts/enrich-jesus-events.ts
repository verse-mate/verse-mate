/**
 * Fill the event-page detail the schema has always had room for and nothing
 * has ever written.
 *
 *   bun run jesus:enrich -- --slugs=event-gethsemane          # inspect, write nothing
 *   bun run jesus:enrich -- --limit=5 --apply
 *   bun run jesus:enrich -- --apply
 *
 * Covers two items from docs/jesus-content-status.md at once, because both are
 * the same question asked of the same passage text:
 *
 *   item 9 — `jesus_event_reveals`, `jesus_event_reactions`,
 *            `jesus_event_people` and `jesus_events.location`. Four tables with
 *            no writer anywhere in the codebase; the UI renders their empty
 *            states ("Nothing recorded for this event yet.").
 *   item 6 — `jesus_event_passages.unique_to_account` and `.emphasis`, which
 *            are what make the Compare tab say what each Gospel *adds* rather
 *            than only which ones record the event.
 *
 * GROUNDING
 *
 * Everything is answered from the verse text supplied in the prompt, and every
 * claim carries the reference it came from. Reveals and reactions are stored at
 * provenance 2 (interpretation) — they are readings of the text, not extraction
 * of it, and the level-1 path is `jesus:extract`. People and location are plain
 * facts of the narrative.
 *
 * Re-running replaces an event's rows rather than appending, so a second run
 * converges instead of duplicating.
 */
import { db } from "database";
import { getAiProvider } from "../../shared/ai/ai-provider.factory";
import { JESUS_REVEAL_CHANNELS } from "../jesus.constants";
import { JesusEventRepository } from "../repository/jesus-event.repository";
import { JesusGenerationService } from "../services/jesus-generation.service";

export interface Enrichment {
  location?: string | null;
  people?: Array<{ person: string; role: string }>;
  reveals?: Array<{ channel: string; content: string; source_ref: string }>;
  reactions?: Array<{ who: string; what: string; source_ref: string }>;
  accounts?: Array<{
    book: string;
    chapter: number;
    unique_to_account: string;
    emphasis: string;
  }>;
}

export const ENRICH_INSTRUCTIONS = `You describe one event in the life of Jesus using ONLY the Gospel text supplied. Never add detail the passages do not contain.

Return JSON with these keys:

"location": where it happens, as the text names it ("Gethsemane", "the Sea of Galilee", "Capernaum", "Jerusalem"). Null if the passages do not say.

"people": everyone present besides Jesus, each as {"person","role"}. Role is short and descriptive: "disciple", "the twelve", "Pharisees", "the crowd", "father of the boy", "high priest". Omit people merely mentioned in speech.

"reveals": what the event discloses about who Jesus is, each as {"channel","content","source_ref"}.
  channel must be exactly one of: ${JESUS_REVEAL_CHANNELS.join(" | ")}
    SAYS_ABOUT_HIMSELF — He states something about Himself
    DEMONSTRATES — He shows it by acting
    OTHERS_SAY — someone in the scene says it about Him
    NARRATOR_SAYS — the Gospel writer says it directly
  content is one sentence. source_ref is the verse, e.g. "Mark 4:39".

"reactions": how people in the scene responded, each as {"who","what","source_ref"}. Only reactions the text records.

"accounts": one entry per Gospel that records this event, as {"book","chapter","unique_to_account","emphasis"}.
  unique_to_account — what THIS Gospel includes that the others do not. If it adds nothing distinctive, say so plainly in a few words.
  emphasis — what this account foregrounds, in a few words.

Every source_ref must be a passage supplied to you. Use [] for anything the text does not support — an empty list is correct and expected, invention is not.`;

const CHANNELS = new Set<string>(JESUS_REVEAL_CHANNELS);

async function main() {
  const argv = process.argv.slice(2);
  const get = (n: string) =>
    argv
      .find((a) => a.startsWith(`--${n}=`))
      ?.split("=")
      .slice(1)
      .join("=");
  const has = (n: string) => argv.includes(`--${n}`);

  const apply = has("apply");
  const limit =
    Number.parseInt(get("limit") ?? "0", 10) || Number.POSITIVE_INFINITY;
  const model = get("model") ?? "gpt-5";
  const slugsArg = get("slugs")
    ?.split(",")
    .map((s) => s.trim());

  const conn = db.getOrCreateConnection();
  const events = new JesusEventRepository(db);
  const service = new JesusGenerationService(db);
  const ai = getAiProvider();

  const all = await events.listEvents(
    {},
    { limit: 1000, orderBy: "chronology" },
  );
  const targets = all
    .filter((e) => !slugsArg || slugsArg.includes(e.slug))
    .slice(0, limit);

  const bookIds = new Map(
    (await conn.selectFrom("books").select(["book_id", "name"]).execute()).map(
      (b) => [b.name, b.book_id],
    ),
  );

  console.log(
    `${apply ? "" : "[no --apply, nothing will be written] "}${targets.length} event(s) · model=${model}\n`,
  );
  const tally = {
    events: 0,
    location: 0,
    people: 0,
    reveals: 0,
    reactions: 0,
    accounts: 0,
    failed: 0,
  };

  for (const e of targets) {
    const full = await events.getEventBySlug(e.slug, "en-US");
    if (!full) continue;

    // The passage text only — NOT another prompt's rendered template, which
    // would put a second task description in front of the model.
    const passageBlock = await service.renderEventPassages(e.slug, {});
    if (!passageBlock) {
      console.log(`  ✗ ${e.slug} — no passage text`);
      tally.failed++;
      continue;
    }

    let data: Enrichment;
    try {
      const res = await ai.responsesCreate({
        model,
        instructions: ENRICH_INSTRUCTIONS,
        input: `Event: ${full.title}\nSummary: ${full.summary ?? ""}\nGospel accounts: ${(full.passages ?? []).map((p) => p.display).join(" · ")}\n\nPassages:\n${passageBlock}`,
        reasoningEffort: "medium",
        maxOutputTokens: 16000,
      });
      data = JSON.parse(
        res.outputText.trim().replace(/^```json\s*|\s*```$/g, ""),
      );
    } catch (err) {
      console.log(`  ✗ ${e.slug} — ${(err as Error).message.slice(0, 70)}`);
      tally.failed++;
      continue;
    }

    const reveals = (data.reveals ?? []).filter(
      (r) => CHANNELS.has(r.channel) && r.content?.trim(),
    );
    const reactions = (data.reactions ?? []).filter(
      (r) => r.who?.trim() && r.what?.trim(),
    );
    const people = (data.people ?? []).filter((p) => p.person?.trim());
    const accounts = (data.accounts ?? []).filter((a) => a.book && a.chapter);

    console.log(
      `  ${e.slug.padEnd(42)} loc=${data.location ? "y" : "-"} people=${people.length} reveals=${reveals.length} reactions=${reactions.length} accounts=${accounts.length}`,
    );

    if (!apply) continue;

    // Replace rather than append so a re-run converges.
    await conn
      .deleteFrom("jesus_event_reveals")
      .where("event_id", "=", full.event_id)
      .execute();
    await conn
      .deleteFrom("jesus_event_reactions")
      .where("event_id", "=", full.event_id)
      .execute();
    await conn
      .deleteFrom("jesus_event_people")
      .where("event_id", "=", full.event_id)
      .execute();

    if (data.location) {
      await conn
        .updateTable("jesus_events")
        .set({ location: data.location })
        .where("event_id", "=", full.event_id)
        .execute();
      tally.location++;
    }
    if (people.length) {
      await conn
        .insertInto("jesus_event_people")
        .values(
          people.map((p) => ({
            event_id: full.event_id,
            person: p.person,
            role: p.role ?? "",
          })),
        )
        .execute();
      tally.people += people.length;
    }
    if (reveals.length) {
      await conn
        .insertInto("jesus_event_reveals")
        .values(
          reveals.map((r, i) => ({
            event_id: full.event_id,
            channel: r.channel,
            content: r.content,
            source_ref: r.source_ref ?? null,
            provenance: 2,
            language_code: "en-US",
            sort_order: i,
            is_active: true,
          })),
        )
        .execute();
      tally.reveals += reveals.length;
    }
    if (reactions.length) {
      await conn
        .insertInto("jesus_event_reactions")
        .values(
          reactions.map((r, i) => ({
            event_id: full.event_id,
            who: r.who,
            what: r.what,
            source_ref: r.source_ref ?? null,
            provenance: 2,
            language_code: "en-US",
            sort_order: i,
          })),
        )
        .execute();
      tally.reactions += reactions.length;
    }
    for (const a of accounts) {
      const bookId = bookIds.get(a.book);
      if (!bookId) continue;

      // The model is asked for a chapter number and mostly gives one, but it
      // also returns a reference fragment such as "13:53-58". Passing that
      // straight into an integer column aborted the entire writeback on a
      // single malformed row, so take the leading integer and skip a value
      // that has none.
      const chapter = Number.parseInt(String(a.chapter), 10);
      if (!Number.isFinite(chapter)) continue;

      const res = await conn
        .updateTable("jesus_event_passages")
        .set({
          unique_to_account: a.unique_to_account ?? null,
          emphasis: a.emphasis ?? null,
        })
        .where("event_id", "=", full.event_id)
        .where("book_id", "=", bookId)
        .where("chapter", "=", chapter)
        .executeTakeFirst();
      if (Number(res.numUpdatedRows ?? 0) > 0) tally.accounts++;
    }
    tally.events++;
  }

  console.log(
    `\nevents ${tally.events} · location ${tally.location} · people ${tally.people} · reveals ${tally.reveals} · reactions ${tally.reactions} · passages annotated ${tally.accounts} · failed ${tally.failed}`,
  );
  console.log(apply ? "written" : "nothing written (no --apply)");
  await db.closeConnection();
}

// Only run the CLI when this file IS the entrypoint. `generate-jesus-content-batch`
// imports the prompt and the writer from here, and an unguarded call would run a
// full synchronous enrichment as a side effect of that import — which it did.
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Write one event's enrichment. Exported so the batched collect writes rows by
 * exactly the same rules as the synchronous run — replace-not-append, the same
 * channel filter, the same provenance.
 */
export async function writeEnrichment(
  conn: ReturnType<typeof db.getOrCreateConnection>,
  eventId: string,
  data: Enrichment,
  bookIds: ReadonlyMap<string, number>,
): Promise<{
  location: number;
  people: number;
  reveals: number;
  reactions: number;
  accounts: number;
}> {
  const CH = new Set<string>(JESUS_REVEAL_CHANNELS);

  /**
   * Collapse repeats within an event, keeping every reference.
   *
   * The model is given all of an event's parallel accounts and answers per
   * account, so one line arrives once per Gospel: Bartimaeus returned "He gives
   * sight to the blind immediately" three times, from Matthew, Mark and Luke.
   * Collapsing an event's parallel accounts is the whole point of the event
   * model, and three identical lines on one page reads as a bug.
   *
   * The duplicates are not always parallel accounts — Pilate really does say "I
   * find no guilt in Him" three times in John — so the references are merged
   * rather than dropped, and the reader still sees that it happened at 18:38,
   * 19:4 and 19:6.
   */
  const dedupe = <T>(
    items: T[],
    key: (t: T) => string,
    ref: (t: T) => string | null | undefined,
    withRef: (t: T, refs: string) => T,
  ): T[] => {
    const seen = new Map<string, { item: T; refs: string[] }>();
    for (const it of items) {
      const k = key(it).toLowerCase().replace(/\s+/g, " ").trim();
      const r = (ref(it) ?? "").trim();
      const hit = seen.get(k);
      if (hit) {
        if (r && !hit.refs.includes(r)) hit.refs.push(r);
      } else {
        seen.set(k, { item: it, refs: r ? [r] : [] });
      }
    }
    return [...seen.values()].map((v) => withRef(v.item, v.refs.join(" · ")));
  };

  const reveals = dedupe(
    (data.reveals ?? []).filter((r) => CH.has(r.channel) && r.content?.trim()),
    (r) => `${r.channel}|${r.content}`,
    (r) => r.source_ref,
    (r, refs) => ({ ...r, source_ref: refs || r.source_ref }),
  );
  const reactions = dedupe(
    (data.reactions ?? []).filter((r) => r.who?.trim() && r.what?.trim()),
    (r) => `${r.who}|${r.what}`,
    (r) => r.source_ref,
    (r, refs) => ({ ...r, source_ref: refs || r.source_ref }),
  );
  const people = (data.people ?? []).filter((p) => p.person?.trim());
  const accounts = (data.accounts ?? []).filter((a) => a.book && a.chapter);
  const out = { location: 0, people: 0, reveals: 0, reactions: 0, accounts: 0 };

  await conn
    .deleteFrom("jesus_event_reveals")
    .where("event_id", "=", eventId)
    .execute();
  await conn
    .deleteFrom("jesus_event_reactions")
    .where("event_id", "=", eventId)
    .execute();
  await conn
    .deleteFrom("jesus_event_people")
    .where("event_id", "=", eventId)
    .execute();

  if (data.location) {
    await conn
      .updateTable("jesus_events")
      .set({ location: data.location })
      .where("event_id", "=", eventId)
      .execute();
    out.location = 1;
  }
  if (people.length) {
    await conn
      .insertInto("jesus_event_people")
      .values(
        people.map((p) => ({
          event_id: eventId,
          person: p.person,
          role: p.role ?? "",
        })),
      )
      .execute();
    out.people = people.length;
  }
  if (reveals.length) {
    await conn
      .insertInto("jesus_event_reveals")
      .values(
        reveals.map((r, i) => ({
          event_id: eventId,
          channel: r.channel,
          content: r.content,
          source_ref: r.source_ref ?? null,
          provenance: 2,
          language_code: "en-US",
          sort_order: i,
          is_active: true,
        })),
      )
      .execute();
    out.reveals = reveals.length;
  }
  if (reactions.length) {
    await conn
      .insertInto("jesus_event_reactions")
      .values(
        reactions.map((r, i) => ({
          event_id: eventId,
          who: r.who,
          what: r.what,
          source_ref: r.source_ref ?? null,
          provenance: 2,
          language_code: "en-US",
          sort_order: i,
        })),
      )
      .execute();
    out.reactions = reactions.length;
  }
  for (const a of accounts) {
    const bookId = bookIds.get(a.book);
    if (!bookId) continue;

    // The model is asked for a chapter number and mostly gives one, but it
    // also returns a reference fragment such as "13:53-58". Passing that
    // straight into an integer column aborted the entire writeback on a
    // single malformed row, so take the leading integer and skip a value
    // that has none.
    const chapter = Number.parseInt(String(a.chapter), 10);
    if (!Number.isFinite(chapter)) continue;

    const res = await conn
      .updateTable("jesus_event_passages")
      .set({
        unique_to_account: a.unique_to_account ?? null,
        emphasis: a.emphasis ?? null,
      })
      .where("event_id", "=", eventId)
      .where("book_id", "=", bookId)
      .where("chapter", "=", chapter)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows ?? 0) > 0) out.accounts++;
  }
  return out;
}
