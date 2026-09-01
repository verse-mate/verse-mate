import { describe, expect, it } from "bun:test";

import {
  COACH_INTAKE_DEFAULT_CRON,
  COACH_INTAKE_JOB,
  COACH_INTAKE_QUEUE,
} from "./coach-intake.queue";

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
    // The old host pushed a rebuilt coach.data.json to verse-mate's default
    // branch on a timer, using a credential with write access to production
    // source control. Nothing here may reacquire that.
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

  it("the worker does not autorun — the plugin starts it, as every other worker is started", async () => {
    const source = await Bun.file(
      new URL("./coach-intake.worker.ts", import.meta.url).pathname,
    ).text();
    expect(source).toMatch(/autorun:\s*false/);
    // One tick at a time: two would poll the same window and spend provider
    // quota twice for nothing.
    expect(source).toMatch(/concurrency:\s*1/);
  });

  it("a missing credential SKIPS loudly rather than reporting an empty poll", async () => {
    const source = await Bun.file(
      new URL("./coach-intake.worker.ts", import.meta.url).pathname,
    ).text();
    expect(source).toMatch(/firefliesConfigured\(\)/);
    expect(source).toMatch(/no-credential/);
  });
});
