export type WorkerRole = "all" | "api" | "worker";

export function workerRole(): WorkerRole {
  const raw = (process.env.VERSEMATE_ROLE ?? "").trim().toLowerCase() || "all";
  if (raw === "all" || raw === "api" || raw === "worker") return raw;
  throw new Error(
    `[QUEUE] Unknown VERSEMATE_ROLE "${raw}"; expected all, api or worker`,
  );
}

export function runsWorkers(role: WorkerRole): boolean {
  return role !== "api";
}

export function runsApiStartup(role: WorkerRole): boolean {
  return role !== "worker";
}
