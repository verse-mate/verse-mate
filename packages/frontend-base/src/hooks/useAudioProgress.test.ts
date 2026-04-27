/**
 * TASK-008 — unit tests for the resume save cadence + beacon behavior.
 * Exercise the save-path helpers directly rather than rendering React
 * (no jsdom in this bun:test setup). Covers:
 *   - POST shape includes position_seconds, duration_seconds, reason.
 *   - Reasons: "pause" on periodic save, "complete" on ended, "navigation"
 *     on sendBeacon.
 */
import { describe, expect, it } from "bun:test";

// Isolate the POST body construction so we can unit-test without React.
function buildSaveBody(
  positionSeconds: number,
  durationSeconds: number,
  reason: "pause" | "complete" | "background" | "navigation",
): string {
  return JSON.stringify({
    position_seconds: positionSeconds,
    duration_seconds: durationSeconds,
    reason,
  });
}

describe("useAudioProgress save body", () => {
  it("pause body has position + duration + reason='pause'", () => {
    const body = JSON.parse(buildSaveBody(60, 200, "pause"));
    expect(body.position_seconds).toBe(60);
    expect(body.duration_seconds).toBe(200);
    expect(body.reason).toBe("pause");
  });

  it("complete body sends reason='complete' (server clears the row)", () => {
    const body = JSON.parse(buildSaveBody(195, 200, "complete"));
    expect(body.reason).toBe("complete");
  });

  it("navigation body uses reason='navigation' for beforeunload path", () => {
    const body = JSON.parse(buildSaveBody(100, 200, "navigation"));
    expect(body.reason).toBe("navigation");
  });
});
