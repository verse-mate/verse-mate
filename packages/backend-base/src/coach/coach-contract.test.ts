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

  it("the roster's address change state and coverage's basis are closed sets the portal can switch on", () => {
    const route = (name: string) =>
      coachContract().routes.find((r) => r.route === name)?.response[
        "200"
      ] as Record<string, any>;
    const consts = (schema: { anyOf?: Array<{ const?: string }> }) =>
      (schema.anyOf ?? []).map((s) => s.const);
    const change = route("GET /coach/admin/coaches").properties.coaches.items
      .properties.addressChange.anyOf[0].properties.state;
    expect(consts(change)).toEqual(["pending", "expired", "refused"]);
    const basis = route("GET /coach/admin/coverage").properties.leaders.items
      .properties.basis;
    expect(consts(basis)).toEqual([
      "observed",
      "attested-not-teaching",
      "attestation-lapsed",
      "no-observation",
    ]);
  });
});
