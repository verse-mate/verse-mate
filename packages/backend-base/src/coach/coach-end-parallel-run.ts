import { db as Database } from "database";

import { coachPipelineLive } from "./coach-cutover";
import { endParallelRun } from "./coach-parallel-run";

if (!coachPipelineLive()) {
  console.error(
    "[coach-cutover] COACH_PIPELINE_LIVE is not true: end the parallel run only at cutover",
  );
  process.exit(1);
}
const ended = await endParallelRun(Database);
console.log(
  `[coach-cutover] ${ended} parallel-run session(s) the host never reported now go through the pipeline; any already scored wait in the admin Pipeline tab for an admin to release them`,
);
process.exit(0);
