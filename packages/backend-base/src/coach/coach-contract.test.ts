import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { CONTRACT_PATH, coachContract } from "./coach-contract";

describe("the committed coach contract snapshot matches the routes", () => {
  it("is current: regenerate it with bun run coach:contract in packages/backend-base", () => {
    const committed = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
    expect(committed).toEqual(coachContract());
  });

  it("lists every admin refusal with its status, words and code", () => {
    const { refusals } = coachContract();
    expect(
      refusals["POST /coach/admin/reshares/:sourceSessionId/send"][
        "parallel-run-session"
      ].status,
    ).toBe(409);
  });
});
