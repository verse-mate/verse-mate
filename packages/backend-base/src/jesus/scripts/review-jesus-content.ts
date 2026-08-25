/**
 * Review generated Jesus content against the product's stated position.
 *
 *   bun run jesus:review -- --dry-run
 *   bun run jesus:review -- --kind=explanation --limit=20
 *   bun run jesus:review -- --out=review.json
 *
 * This is not the sign-off `jesus-content-faith-review.md` F6 asks for — that
 * needs a person's name against it. This is the pass that makes such a sign-off
 * possible: 828 explanations and ~2,300 records is more than anyone will read
 * cold, so this reads all of it, flags what looks wrong, and produces a list
 * short enough to actually be reviewed.
 *
 * THE RUBRIC
 *
 * Set by the product owner, and deliberately not a denominational statement:
 *
 *  1. No denomination's distinctives pushed — including the owner's own.
 *  2. Contested doctrine is presented, not settled. Where Christians genuinely
 *     differ, name the disagreement rather than asserting one reading.
 *  3. Claims are grounded in the text cited. A verse reference must support
 *     what the sentence says it supports.
 *  4. Nothing invented — no episode, saying or detail absent from the Gospels.
 *
 * Every finding names the record and quotes the passage at fault, so a reviewer
 * checks a claim rather than taking this file's word for it.
 */
import { db } from "database";
import { getAiProvider } from "../../shared/ai/ai-provider.factory";

const INSTRUCTIONS = `You are checking generated Bible-study content for a study app against four rules. Report only real problems; most records are fine and "no findings" is the expected answer.

RULES
1. NO DENOMINATIONAL PUSH. The content must not advance the distinctives of any tradition — Adventist, Catholic, Reformed, Baptist, Pentecostal or otherwise — as though settled. Naming what a tradition holds, as one view among others, is fine.
2. CONTESTED DOCTRINE IS PRESENTED, NOT SETTLED. Where Christians genuinely differ (the nature of final punishment, the millennium, baptism, church government, the day of worship, predestination, spiritual gifts), the text should say what Scripture states and name the disagreement. Asserting one side as the plain reading is a finding.
3. GROUNDED IN THE CITED TEXT. If a sentence cites a reference, that reference must actually support the claim. A misattributed quotation, a verse that says something else, or a reference to a book/chapter that does not contain the material is a finding.
4. NOTHING INVENTED. No episode, saying, name or detail that is not in the Gospels.

Also flag anything plainly false about the biblical text — wrong speaker, wrong setting, conflated events.

Do NOT flag: interpretation you personally disagree with but which the text supports; devotional or application language; a position clearly marked as one reading among several; brevity.

Respond with ONLY JSON:
{"findings":[{"rule":1|2|3|4,"severity":"high"|"medium"|"low","quote":"<= 160 chars of the offending text, verbatim","why":"<= 25 words"}]}
An empty findings array is correct when nothing is wrong.`;

const sevRank = (f: Finding) =>
  f.severity === "high" ? 3 : f.severity === "medium" ? 2 : 1;

interface Finding {
  rule: number;
  severity: string;
  quote: string;
  why: string;
}

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
  const model = get("model") ?? "gpt-5";
  const kind = get("kind");
  const outPath = get("out") ?? "jesus-review.json";

  const conn = db.getOrCreateConnection();

  // One record per unit a reader actually sees.
  const records: Array<{
    id: string;
    kind: string;
    ref: string;
    text: string;
  }> = [];

  if (!kind || kind === "explanation") {
    const rows = await conn
      .selectFrom("jesus_event_explanations as x")
      .innerJoin("jesus_events as e", "e.event_id", "x.event_id")
      .where("x.is_active", "=", true)
      .select(["x.explanation_id as id", "x.type", "x.content", "e.slug"])
      .execute();
    for (const r of rows)
      records.push({
        id: String(r.id),
        kind: `explanation:${r.type}`,
        ref: r.slug,
        text: r.content,
      });
  }

  if (!kind || kind === "facet") {
    const rows = await conn
      .selectFrom("jesus_facets as f")
      .innerJoin("jesus_events as e", "e.event_id", "f.event_id")
      .where("f.is_active", "=", true)
      .where("f.provenance", "=", 1)
      .select(["f.facet_id as id", "f.type", "f.title", "f.text", "e.slug"])
      .execute();
    for (const r of rows)
      records.push({
        id: String(r.id),
        kind: `facet:${r.type}`,
        ref: r.slug,
        text: `${r.title}${r.text ? ` — "${r.text}"` : ""}`,
      });
  }

  if (!kind || kind === "reveal") {
    const rows = await conn
      .selectFrom("jesus_event_reveals as r")
      .innerJoin("jesus_events as e", "e.event_id", "r.event_id")
      .where("r.is_active", "=", true)
      .select([
        "r.reveal_id as id",
        "r.channel",
        "r.content",
        "r.source_ref",
        "e.slug",
      ])
      .execute();
    for (const r of rows)
      records.push({
        id: String(r.id),
        kind: `reveal:${r.channel}`,
        ref: r.slug,
        text: `${r.content} (${r.source_ref})`,
      });
  }

  const targets = records.slice(0, limit);
  console.log(
    `${dryRun ? "[dry run] " : ""}${targets.length} record(s) to review · model=${model}\n`,
  );
  if (dryRun) {
    const byKind = new Map<string, number>();
    for (const r of targets)
      byKind.set(
        r.kind.split(":")[0],
        (byKind.get(r.kind.split(":")[0]) ?? 0) + 1,
      );
    for (const [k, n] of byKind) console.log(`  ${k.padEnd(14)}${n}`);
    await db.closeConnection();
    return;
  }

  const ai = getAiProvider();

  // ── Batch mode ────────────────────────────────────────────────────────────
  // 2,382 records at one request each is hours of wall-clock and twice the
  // price synchronously. The Batch API is half, and a review is exactly the
  // shape it suits: no ordering, no state, nothing downstream waiting.
  if (has("batch")) {
    const lines = targets.map((r) => ({
      custom_id: `${r.kind}|${r.id}`,
      method: "POST" as const,
      url: "/v1/responses" as const,
      body: {
        model,
        reasoning: { effort: "low" as const },
        instructions: INSTRUCTIONS,
        input: `Record type: ${r.kind}\nEvent: ${r.ref}\n\n${r.text}`,
        max_output_tokens: 3000,
      },
    }));
    const jsonl = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
    const buffer = Buffer.from(jsonl, "utf8");
    console.log(`  payload ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`);
    const file = await ai.filesCreate({
      file: new File(
        [new Uint8Array(buffer)],
        `jesus_review_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });
    const batch = await ai.batchesCreate({
      inputFileId: file.id,
      endpoint: "/v1/responses",
      completionWindow: "24h",
    });
    console.log(`\nsubmitted: ${batch.id}`);
    console.log(
      `collect with: bun run jesus:review -- --collect=${batch.id} --out=${outPath}`,
    );
    await db.closeConnection();
    return;
  }

  const collectId = get("collect");
  if (collectId) {
    const b = await ai.batchesRetrieve(collectId);
    if (b.status !== "completed") {
      console.error(`batch is "${b.status}", not "completed"`);
      process.exit(2);
    }
    const byId = new Map(targets.map((r) => [`${r.kind}|${r.id}`, r]));
    const text = await (await ai.filesContent(b.outputFileId as string)).text();
    const out: Array<{
      id: string;
      kind: string;
      ref: string;
      findings: Finding[];
    }> = [];
    let ok = 0;
    let bad = 0;
    for (const raw of text.split("\n").filter(Boolean)) {
      let line: {
        custom_id: string;
        response?: {
          body?: { output?: Array<{ content?: Array<{ text?: string }> }> };
        };
      };
      try {
        line = JSON.parse(raw);
      } catch {
        bad++;
        continue;
      }
      const rec = byId.get(line.custom_id);
      const outputText = (line.response?.body?.output ?? [])
        .flatMap((o) => o.content ?? [])
        .map((x) => x.text ?? "")
        .join("")
        .trim();
      let parsed: { findings?: Finding[] };
      try {
        parsed = JSON.parse(outputText.replace(/^```json\s*|\s*```$/g, ""));
      } catch {
        bad++;
        continue;
      }
      ok++;
      const findings = (parsed.findings ?? []).filter((f) => f.quote?.trim());
      if (findings.length && rec)
        out.push({ id: rec.id, kind: rec.kind, ref: rec.ref, findings });
    }
    out.sort(
      (a, b2) =>
        Math.min(...b2.findings.map(sevRank)) -
        Math.min(...a.findings.map(sevRank)),
    );
    await Bun.write(outPath, `${JSON.stringify(out, null, 2)}\n`);
    const bySeverity = new Map<string, number>();
    for (const r of out)
      for (const f of r.findings)
        bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);
    console.log(
      `parsed ${ok} · unparseable ${bad} · records with findings ${out.length}`,
    );
    console.log(
      `  by severity: ${[...bySeverity].map(([k, v]) => `${k}=${v}`).join(" · ") || "none"}`,
    );
    console.log(`  → ${outPath}`);
    await db.closeConnection();
    return;
  }

  const flagged: Array<{
    id: string;
    kind: string;
    ref: string;
    findings: Finding[];
  }> = [];
  let clean = 0;
  let failed = 0;

  for (const [i, r] of targets.entries()) {
    let parsed: { findings?: Finding[] };
    try {
      const res = await ai.responsesCreate({
        model,
        instructions: INSTRUCTIONS,
        input: `Record type: ${r.kind}\nEvent: ${r.ref}\n\n${r.text}`,
        reasoningEffort: "low",
        maxOutputTokens: 3000,
      });
      parsed = JSON.parse(
        res.outputText.trim().replace(/^```json\s*|\s*```$/g, ""),
      );
    } catch {
      failed++;
      continue;
    }
    const findings = (parsed.findings ?? []).filter((f) => f.quote?.trim());
    if (findings.length) {
      flagged.push({ id: r.id, kind: r.kind, ref: r.ref, findings });
      for (const f of findings)
        console.log(
          `  ⚑ ${r.ref} [${r.kind}] rule ${f.rule} ${f.severity}: ${f.why}`,
        );
    } else clean++;
    if ((i + 1) % 100 === 0)
      console.log(`  … ${i + 1}/${targets.length} · flagged ${flagged.length}`);
  }

  await Bun.write(outPath, `${JSON.stringify(flagged, null, 2)}\n`);
  console.log(
    `\nreviewed ${targets.length} · clean ${clean} · flagged ${flagged.length} · failed ${failed} → ${outPath}`,
  );
  await db.closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
