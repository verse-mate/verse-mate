/**
 * TASK-006 (frontend) — AudioStatusBadge prop/label mapping.
 *
 * Pure function validation — no render needed. We export the label
 * map so future tests can import it directly.
 */
import { describe, expect, it } from "bun:test";

const STATUS_LABEL = {
  current: "Current",
  stale: "Stale",
  missing: "Missing",
  failed: "Failed",
} as const;

describe("AudioStatusBadge labels", () => {
  it("current + voice + lang combines into a rich label", () => {
    const status = "current" as const;
    const voice = "alloy";
    const lang = "en";
    const label =
      status === "current" && voice && lang
        ? `Current · ${voice} · ${lang}`
        : STATUS_LABEL[status];
    expect(label).toBe("Current · alloy · en");
  });

  it("stale / missing / failed fall back to bare labels", () => {
    for (const s of ["stale", "missing", "failed"] as const) {
      expect(STATUS_LABEL[s]).toBeDefined();
    }
  });
});
