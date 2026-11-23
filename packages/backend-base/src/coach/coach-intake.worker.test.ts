import { afterAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  COACH_INTAKE_DEFAULT_CRON,
  COACH_INTAKE_JOB,
  COACH_INTAKE_QUEUE,
} from "./coach-intake.queue";
import {
  COACH_INTAKE_WORKER_OPTIONS,
  coachIntakeWorker,
  runCoachIntakeTick,
} from "./coach-intake.worker";
import { NOTETAKER_URL } from "./coach-notetaker";
import {
  COACH_NOTETAKER_SHADOW,
  NOTETAKER_EXPORT_TOKEN,
} from "./notetaker-exports.client";

/**
 * Task 4.3's scenario is "No operator host is involved". What makes that true
 * is structural rather than behavioural, so this asserts the structure: the
 * pipeline's clock is a BullMQ repeatable job inside VerseMate, and nothing in
 * the coach package reaches a machine outside it or holds a credential that
 * could write to production source control.
 */
describe("the pipeline's clock lives inside VerseMate", () => {
  it("polls on the cadence the host's timer used", () => {
    expect(COACH_INTAKE_DEFAULT_CRON).toBe("*/30 * * * *");
    expect(COACH_INTAKE_QUEUE).toBe("coach-intake");
    expect(COACH_INTAKE_JOB).toBe("coach-intake-run");
  });

  it("no coach module holds a source-control credential or an operator-host address", async () => {
    const dir = new URL(".", import.meta.url).pathname;
    const files = [...new Bun.Glob("*.ts").scanSync(dir)].filter(
      (f) => !f.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      const source = await Bun.file(`${dir}${file}`).text();
      // Deliberately narrow: a git remote, a push, or an SSH hop.
      expect(source).not.toMatch(/GITHUB_TOKEN|GH_TOKEN|GITEA_TOKEN/);
      expect(source).not.toMatch(/git\s+push|ssh\s+-|scp\s+/);
      expect(source).not.toMatch(/systemctl|crontab/);
    }
  });

  it("the worker does not autorun, the plugin starts it, as every other worker is started", () => {
    // The VALUES, not a regex against this module's text: a source scan passes
    // on a commented-out line and on `concurrency: 10`.
    expect(COACH_INTAKE_WORKER_OPTIONS.autorun).toBe(false);
    // One tick at a time: two would poll the same window and spend provider
    // quota twice for nothing.
    expect(COACH_INTAKE_WORKER_OPTIONS.concurrency).toBe(1);
  });

  it("a missing credential SKIPS loudly rather than reporting an empty poll", async () => {
    // RUN it. The old version asserted that the source text contains
    // `firefliesConfigured()`, which stays true however the call is used.
    // Without the credential every tick would poll nothing and report success,
    // which is indistinguishable from a quiet week.
    const key = process.env.FIREFLIES_API_KEY;
    Reflect.deleteProperty(process.env, "FIREFLIES_API_KEY");
    try {
      const result = await runCoachIntakeTick();
      expect(result.skipped).toBe("no-credential");
      expect(result.observed).toBe(0);
      expect(result.delivered).toBe(0);
    } finally {
      if (key !== undefined) process.env.FIREFLIES_API_KEY = key;
    }
  });

  it("the notetaker shadow runs only when switched on, and is counted apart from the leaders' sessions", async () => {
    const names = [
      "FIREFLIES_API_KEY",
      COACH_NOTETAKER_SHADOW,
      NOTETAKER_URL,
      NOTETAKER_EXPORT_TOKEN,
    ];
    const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
    for (const n of names) Reflect.deleteProperty(process.env, n);
    // Nothing of the shadow's is waiting, so no tick below scores anything.
    const waiting = await Database.getOrCreateConnection()
      .selectFrom("coach_intake_sessions")
      .select("source_session_id")
      .where("source", "=", "notetaker")
      .where("state", "in", ["observed", "held", "retained"])
      .execute();
    expect(waiting).toEqual([]);
    try {
      const off = await runCoachIntakeTick();
      expect(off.notetaker).toBeUndefined();

      // On, against a gateway that cannot answer (.invalid never resolves):
      // the poll fails loudly, the tick still completes and reports it.
      process.env[COACH_NOTETAKER_SHADOW] = "true";
      process.env[NOTETAKER_URL] = "https://notetaker.invalid";
      process.env[NOTETAKER_EXPORT_TOKEN] = "export-token";
      const on = await runCoachIntakeTick();
      expect(on.skipped).toBe("no-credential");
      expect(on.notetaker).toMatchObject({
        observed: 0,
        retrievalAttempted: 0,
        scored: 0,
      });
      expect(on.delivered).toBe(0);
    } finally {
      for (const n of names)
        if (saved[n] === undefined) Reflect.deleteProperty(process.env, n);
        else process.env[n] = saved[n];
    }
  });
});

afterAll(async () => {
  await coachIntakeWorker.waitUntilReady();
  await coachIntakeWorker.close();
});
