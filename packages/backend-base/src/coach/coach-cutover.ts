export const COACH_PIPELINE_LIVE = "COACH_PIPELINE_LIVE";

export function coachPipelineLive(): boolean {
  return (
    (process.env[COACH_PIPELINE_LIVE] ?? "").trim().toLowerCase() === "true"
  );
}
