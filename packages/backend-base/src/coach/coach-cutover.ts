export const COACH_PIPELINE_LIVE = "COACH_PIPELINE_LIVE";

export function coachPipelineLive(): boolean {
  return (
    (process.env[COACH_PIPELINE_LIVE] ?? "").trim().toLowerCase() === "true"
  );
}

export function assertBeforeCutover(): void {
  if (coachPipelineLive()) {
    throw new Error(
      `The legacy backfill is not run after cutover: ${COACH_PIPELINE_LIVE} is on, so the pipeline is the only writer of reports.`,
    );
  }
}
