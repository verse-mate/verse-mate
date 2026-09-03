/**
 * Which workers this container runs (change: port-coach-pipeline, task 5.3a).
 *
 * Production is one `verse-mate-backend` container today, and every worker
 * starts unconditionally from `shared.plugin`'s `onStart`. Adding a second
 * container of the same image would therefore run EVERY worker twice, two
 * intake polls against the same provider quota, two audio generators competing
 * for the same jobs.
 *
 * So the image gets a role. The default is `all`, which is exactly today's
 * behaviour: a single-container deployment keeps working with nothing set, and
 * splitting the roles is an opt-in that happens the day the second service is
 * added. A default of `api` would have silently stopped media work on the
 * existing deployment the moment this shipped.
 */

export type WorkerRole = "all" | "api" | "media-worker";

export function workerRole(): WorkerRole {
  const raw = (process.env.VERSEMATE_ROLE ?? "all").trim().toLowerCase();
  if (raw === "api" || raw === "media-worker") return raw;
  if (raw !== "all" && raw !== "") {
    // Loud, because a typo here silently halves the pipeline.
    console.error(
      `[QUEUE] Unknown VERSEMATE_ROLE "${raw}"; running every worker ("all")`,
    );
  }
  return "all";
}

/**
 * Media work: anything that moves large files or spends provider quota on
 * them. These are what move to the second container.
 */
export function runsMediaWorkers(role: WorkerRole = workerRole()): boolean {
  return role === "all" || role === "media-worker";
}

/** Everything else, plus the HTTP server. */
export function runsApiWorkers(role: WorkerRole = workerRole()): boolean {
  return role === "all" || role === "api";
}
