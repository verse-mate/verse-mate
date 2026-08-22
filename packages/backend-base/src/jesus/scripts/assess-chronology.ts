/**
 * Assess `jesus_events.chronology_confidence` per event.
 *
 *   bun run jesus:chronology -- --dry-run --slugs=event-gethsemane,cleansing-the-temple
 *   bun run jesus:chronology -- --limit=20
 *   bun run jesus:chronology -- --apply
 *
 * Migration 20260817120000 set every event to `probable` as a blanket default.
 * A caveat applied uniformly carries no information: it tells a reader nothing
 * about whether the Gospels actually agree on where an event belongs. This
 * assesses each one and writes the value it earns.
 *
 * Nothing is written unless `--apply` is passed. Every assessment is reported
 * with its reason so the judgement can be checked rather than taken on trust —
 * this is a claim about the text, and the well-known cases (the Passion Week
 * day markers, the two temple cleansings) are exactly the ones a reviewer can
 * verify at a glance.
 */
import { db } from "database";
import { getAiProvider } from "../../shared/ai/ai-provider.factory";
import { JesusEventRepository } from "../repository/jesus-event.repository";

const VALUES = ["high", "probable", "disputed"] as const;
type Confidence = (typeof VALUES)[number];

const INSTRUCTIONS = `You assess how firmly an event in the life of Jesus is fixed in the chronology of the Gospels. This is a question about the sources, not about whether the event happened.

Answer with exactly one of:

"high" — the position is fixed by explicit narrative sequence the sources share, or the event is a unique unrepeatable anchor. Examples: events inside Passion Week, which the Gospels date by day; the Transfiguration ("six days later" after Peter's confession); the Temptation, which follows the Baptism immediately in all three Synoptics; the Crucifixion, Resurrection, Ascension; the infancy narratives.

"probable" — the period is clear and uncontested, but the exact position within it is an editorial ordering rather than something the text fixes. Most Galilean-ministry miracles and encounters are this: everyone agrees roughly when, nobody agrees on the order.

"disputed" — the Gospels place it at materially different points in the ministry, or it is a saying, parable or formula reported in more than one setting so it has no single moment. Examples: the cleansing of the temple, which John puts at the start of the ministry and the Synoptics in the final week; teaching that Matthew places in the Sermon on the Mount and Luke on the road; a recurring question or formula.

Judge the placement, not the importance. A famous event can still be "disputed"; a minor one can be "high".

Respond with ONLY JSON: {"confidence":"high"|"probable"|"disputed","why":"<=18 words"}`;

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
  const slugs = get("slugs")
    ?.split(",")
    .map((s) => s.trim());
  const outPath = get("out");

  const conn = db.getOrCreateConnection();
  const events = new JesusEventRepository(db);

  const all = await events.listEvents(
    {},
    { limit: 1000, orderBy: "chronology" },
  );
  const targets = all
    .filter((e) => !slugs || slugs.includes(e.slug))
    .slice(0, limit);

  console.log(
    `${apply ? "" : "[no --apply, nothing will be written] "}${targets.length} event(s) · model=${model}\n`,
  );

  const ai = getAiProvider();
  const results: Array<{
    slug: string;
    title: string;
    confidence: Confidence;
    why: string;
  }> = [];
  const tally: Record<string, number> = { high: 0, probable: 0, disputed: 0 };

  for (const e of targets) {
    const full = await events.getEventBySlug(e.slug, "en-US");
    const accounts = (full?.passages ?? []).map((p) => p.display).join(" · ");
    const input = `Event: ${e.title}
Summary: ${full?.summary ?? ""}
Period: ${full?.period_name ?? "(unplaced)"}
Gospel accounts: ${accounts || "(none recorded)"}`;

    let parsed: { confidence?: string; why?: string };
    try {
      const res = await ai.responsesCreate({
        model,
        instructions: INSTRUCTIONS,
        input,
        reasoningEffort: "low",
        maxOutputTokens: 2000,
      });
      parsed = JSON.parse(
        res.outputText.trim().replace(/^```json\s*|\s*```$/g, ""),
      );
    } catch (err) {
      console.log(`  ✗ ${e.slug} — ${(err as Error).message.slice(0, 60)}`);
      continue;
    }

    const confidence = parsed.confidence as Confidence;
    if (!VALUES.includes(confidence)) {
      console.log(
        `  ✗ ${e.slug} — bad value ${JSON.stringify(parsed.confidence)}`,
      );
      continue;
    }

    tally[confidence]++;
    results.push({
      slug: e.slug,
      title: e.title,
      confidence,
      why: parsed.why ?? "",
    });
    const mark =
      confidence === "high" ? "▲" : confidence === "disputed" ? "▽" : " ";
    console.log(
      `  ${mark} ${confidence.padEnd(9)} ${e.slug.padEnd(44)} ${parsed.why ?? ""}`,
    );

    if (apply) {
      await conn
        .updateTable("jesus_events")
        .set({ chronology_confidence: confidence, updated_at: new Date() })
        .where("slug", "=", e.slug)
        .execute();
    }
  }

  console.log(
    `\nhigh ${tally.high} · probable ${tally.probable} · disputed ${tally.disputed}${apply ? " — written" : " — not written (no --apply)"}`,
  );
  if (outPath)
    await Bun.write(outPath, `${JSON.stringify(results, null, 2)}\n`);
  await db.closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
