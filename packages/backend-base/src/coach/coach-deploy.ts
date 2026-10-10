import { db as Database } from "database";
import { sql } from "kysely";

import leaderMapJson from "./coach-leader-map.json";
import { backfillCoachRoster } from "./coach-roster.backfill";
import { backfillCoachStore } from "./coach-store.backfill";
import coachDataJson from "./coach.data.json";

export const DEPLOY_LOCK = 7_310_002;

async function step(name: string, run: () => Promise<string>): Promise<void> {
  try {
    console.log(`[coach-deploy] ${name}: ${await run()}`);
  } catch (error) {
    const { message, code } = error as { message?: string; code?: string };
    console.error(
      `[coach-deploy] ${name} failed${code ? ` (${code})` : ""}: ${message ?? String(error)}`,
    );
  }
}

export async function runCoachDeployStep(
  dataset: unknown = coachDataJson,
  leaderMap: unknown = leaderMapJson,
  { lockTimeout = "60s" }: { lockTimeout?: string } = {},
): Promise<void> {
  await Database.getOrCreateConnection()
    .connection()
    .execute(async (lockHolder) => {
      await sql`SELECT set_config('lock_timeout', ${lockTimeout}, false)`.execute(
        lockHolder,
      );
      try {
        await sql`SELECT pg_advisory_lock(${DEPLOY_LOCK})`.execute(lockHolder);
      } catch (error) {
        console.error(
          `[coach-deploy] skipped: another process held the deploy lock for ${lockTimeout} (${(error as { message?: string }).message ?? String(error)})`,
        );
        return;
      } finally {
        await sql`SELECT set_config('lock_timeout', '0', false)`.execute(
          lockHolder,
        );
      }
      try {
        await step("roster backfill", async () => {
          const r = await backfillCoachRoster(dataset, leaderMap);
          const unkeyed =
            r.leadersWithoutKeywords.length > 0
              ? `; no attribution keywords for: ${r.leadersWithoutKeywords.join(", ")}`
              : "";
          return `${r.leaders} leaders, ${r.admins} admin(s) in the bundle, ${r.leaderSummaries} leader-month summaries${unkeyed}`;
        });
        await step("report backfill", async () => {
          const r = await backfillCoachStore(dataset);
          return `${r.loaded} reports`;
        });
      } finally {
        await sql`SELECT pg_advisory_unlock(${DEPLOY_LOCK})`.execute(
          lockHolder,
        );
      }
    });
}
