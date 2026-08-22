/**
 * Propose the missing `quote` / `quoteRef` for Jesus corpus entries.
 *
 *   bun run jesus:quotes -- --dry-run
 *   bun run jesus:quotes -- --kinds=PARABLE --limit=5
 *   bun run jesus:quotes -- --out=proposals.json
 *
 * WHY THIS EXISTS
 *
 * `quote` is what becomes a facet's `text` — the actual words. Coverage is
 * all-or-nothing by kind: Command, Question and Claim are complete (75/75),
 * while Parable (0/40) and Teaching (1/29) are empty. A parable that renders as
 * a title and a summary with nothing said in it is a strange thing for a
 * parable to be, and it is the category the hub advertises most heavily.
 *
 * WHY IT IS NOT A PLAIN SEED
 *
 * The corpus lives in `packages/database/src/seeds/data/jesus.data.ts` — a
 * source file, not a table. So this writes a proposals file for review and a
 * patch is applied to that source in a PR; nothing here touches the database.
 *
 * THE GUARANTEE THAT MAKES THIS SAFE ON A BIBLE PRODUCT
 *
 * Every proposed quote is checked **verbatim against the `verses` table** for
 * the reference it claims. A model cannot invent scripture into the corpus: a
 * quote that is not a literal substring of the cited verse text is rejected and
 * reported, never written. That is the same posture as `jesus:generate`, which
 * rejects rather than stores.
 *
 * Action facets (Miracle, Encounter, Compassion, Confrontation) are skipped by
 * default — they carry an `actor` and describe an episode rather than a saying,
 * which is why they were left without quotes by design.
 */
import { db } from "database";
import { JESUS_ENTRIES } from "database/src/seeds/data/jesus.data";
import { parseReference } from "database/src/seeds/jesus.seed";
import { getAiProvider } from "../../shared/ai/ai-provider.factory";

/** Kinds whose facet is an episode, not a saying — no quote expected. */
const ACTION_KINDS = new Set([
  "MIRACLE",
  "ENCOUNTER",
  "COMPASSION",
  "CONFRONTATION",
]);

const DEFAULT_MODEL = "gpt-5";
const BIBLE_VERSION = "NASB1995";

interface Proposal {
  slug: string;
  kind: string;
  title: string;
  quote: string;
  quoteRef: string;
  status: "accepted" | "rejected";
  reason?: string;
}

/** Whitespace- and punctuation-tolerant comparison; the text must still match. */
function normalize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function loadPassage(
  conn: Awaited<ReturnType<typeof db.getOrCreateConnection>>,
  ref: string,
): Promise<{ ref: string; verses: { n: number; text: string }[] } | null> {
  let parsed: ReturnType<typeof parseReference>;
  try {
    parsed = parseReference(ref);
  } catch {
    return null;
  }

  let q = conn
    .selectFrom("verses")
    .innerJoin("chapters", "chapters.chapter_id", "verses.chapter_id")
    .innerJoin("books", "books.book_id", "chapters.book_id")
    .innerJoin("bible_versions", "bible_versions.id", "verses.version_id")
    .where("books.name", "=", parsed.book)
    .where("chapters.chapter_number", "=", parsed.chapter)
    .where("bible_versions.version_key", "=", BIBLE_VERSION)
    .select(["verses.verse_number as n", "verses.text as text"])
    .orderBy("verses.verse_number");

  if (parsed.verseStart !== null) {
    q = q
      .where("verses.verse_number", ">=", parsed.verseStart)
      .where("verses.verse_number", "<=", parsed.verseEnd ?? parsed.verseStart);
  }

  const verses = await q.execute();
  return verses.length ? { ref, verses } : null;
}

const INSTRUCTIONS = `You select a single verbatim line of scripture to represent an entry in a Jesus-of-the-Gospels reference corpus.

Rules, all mandatory:
- The quote MUST be copied EXACTLY, character for character, from the passage text supplied. Do not paraphrase, modernise, join non-adjacent text, or fix punctuation.
- Prefer words SPOKEN BY JESUS. If the entry is a parable, choose the line that carries its point, not the narrative framing ("He said to them", "And He told them a parable").
- Keep it short and quotable: aim for 40-120 characters, one sentence. Never more than 200.
- The reference must be the SINGLE verse the quote comes from, formatted exactly like "Matthew 13:9". If the quote spans two adjacent verses, cite the first.
- Do not include the verse number, quotation marks, or a trailing ellipsis in the quote itself.

Respond with ONLY a JSON object: {"quote": "...", "quoteRef": "Book C:V"}`;

async function main() {
  const argv = process.argv.slice(2);
  const get = (n: string) =>
    argv
      .find((a) => a.startsWith(`--${n}=`))
      ?.split("=")
      .slice(1)
      .join("=");
  const has = (n: string) => argv.includes(`--${n}`);

  const dryRun = has("dry-run");
  const limit =
    Number.parseInt(get("limit") ?? "0", 10) || Number.POSITIVE_INFINITY;
  const model = get("model") ?? DEFAULT_MODEL;
  const outPath = get("out") ?? "jesus-quote-proposals.json";
  const kinds = get("kinds")
    ?.split(",")
    .map((k) => k.trim().toUpperCase());
  const slugs = get("slugs")
    ?.split(",")
    .map((x) => x.trim());
  const includeActions = has("include-actions");

  const conn = db.getOrCreateConnection();

  const targets = (JESUS_ENTRIES as any[])
    .filter((e) => !e.quote)
    .filter((e) => includeActions || !ACTION_KINDS.has(e.kind))
    .filter((e) => !kinds || kinds.includes(e.kind))
    .filter((e) => !slugs || slugs.includes(e.slug))
    .slice(0, limit);

  console.log(
    `${dryRun ? "[dry run] " : ""}${targets.length} entr(ies) needing a quote · model=${model} · version=${BIBLE_VERSION}\n`,
  );

  // Constructed lazily: --dry-run renders prompts and needs no provider key.
  let ai: ReturnType<typeof getAiProvider> | null = null;
  const proposals: Proposal[] = [];

  for (const entry of targets) {
    const passages = (
      await Promise.all(
        (entry.refs ?? []).map((r: string) => loadPassage(conn, r)),
      )
    ).filter(Boolean) as {
      ref: string;
      verses: { n: number; text: string }[];
    }[];

    if (!passages.length) {
      proposals.push({
        slug: entry.slug,
        kind: entry.kind,
        title: entry.title,
        quote: "",
        quoteRef: "",
        status: "rejected",
        reason: `no passage text for refs: ${(entry.refs ?? []).join(", ")}`,
      });
      console.log(`  ✗ ${entry.slug} — no passage text`);
      continue;
    }

    const passageBlock = passages
      .map(
        (p) =>
          `${p.ref}\n${p.verses.map((v) => `${v.n}. ${v.text}`).join("\n")}`,
      )
      .join("\n\n");

    const input = `Entry: ${entry.title}
Kind: ${entry.kind}
Summary: ${entry.summary}

Passage text (${BIBLE_VERSION}):
${passageBlock}`;

    if (dryRun) {
      console.log(`  · ${entry.slug} — ${input.length} chars of prompt`);
      continue;
    }

    let raw: string;
    try {
      ai ??= getAiProvider();
      const res = await ai.responsesCreate({
        model,
        instructions: INSTRUCTIONS,
        input,
        reasoningEffort: "low",
        maxOutputTokens: 4000,
      });
      raw = res.outputText;
    } catch (err) {
      proposals.push({
        slug: entry.slug,
        kind: entry.kind,
        title: entry.title,
        quote: "",
        quoteRef: "",
        status: "rejected",
        reason: `provider error: ${(err as Error).message}`,
      });
      console.log(`  ✗ ${entry.slug} — provider error`);
      continue;
    }

    let parsedOut: { quote?: string; quoteRef?: string };
    try {
      parsedOut = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      proposals.push({
        slug: entry.slug,
        kind: entry.kind,
        title: entry.title,
        quote: "",
        quoteRef: "",
        status: "rejected",
        reason: `unparseable model output: ${raw.slice(0, 120)}`,
      });
      console.log(`  ✗ ${entry.slug} — unparseable output`);
      continue;
    }

    const quote = (parsedOut.quote ?? "").trim();
    const quoteRef = (parsedOut.quoteRef ?? "").trim();

    // ── The gate: the quote must literally exist in the cited verse. ──
    const cited = await loadPassage(conn, quoteRef);
    const citedText = cited ? cited.verses.map((v) => v.text).join(" ") : "";
    // Allow a quote that runs into the next verse of the same chapter.
    const withNeighbour = cited
      ? [
          citedText,
          (
            await loadPassage(
              conn,
              `${quoteRef.replace(/:(\d+)$/, (_m, v) => `:${Number(v)}-${Number(v) + 1}`)}`,
            )
          )?.verses
            .map((v) => v.text)
            .join(" ") ?? "",
        ].join(" ")
      : "";

    const ok =
      quote.length > 0 &&
      cited !== null &&
      normalize(withNeighbour).includes(normalize(quote));

    proposals.push({
      slug: entry.slug,
      kind: entry.kind,
      title: entry.title,
      quote,
      quoteRef,
      status: ok ? "accepted" : "rejected",
      reason: ok
        ? undefined
        : cited === null
          ? `citation "${quoteRef}" resolves to no verse text`
          : "quote is not verbatim in the cited verse",
    });

    console.log(
      ok
        ? `  ✓ ${entry.slug} — ${quoteRef} (${quote.length} chars)`
        : `  ✗ ${entry.slug} — ${proposals[proposals.length - 1].reason}`,
    );
  }

  if (!dryRun) {
    await Bun.write(outPath, `${JSON.stringify(proposals, null, 2)}\n`);
    const accepted = proposals.filter((p) => p.status === "accepted").length;
    console.log(
      `\naccepted ${accepted} · rejected ${proposals.length - accepted} → ${outPath}`,
    );
  }

  await db.closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
