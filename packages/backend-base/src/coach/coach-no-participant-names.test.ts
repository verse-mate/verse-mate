import { describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import coachDataJson from "./coach.data.json";

const conn = Database.getOrCreateConnection();

/**
 * Open question 4, answered provisionally 2026-09-01 (Andy confirms before
 * cutover): attendee NAMES are not captured. Reports keep `attendees` as a
 * count.
 *
 * So task 4.3a is a GUARD, not a feature. The provider supplies names; the job
 * is to drop them at the boundary and to keep every surface counting rather
 * than listing. Governance rule 1's appendix-attendee exception is dropped with
 * the same answer — there is no attendee list for a name to hide in.
 */
describe("no participant name is captured anywhere", () => {
  it("the provider query does not ASK for an attendee roster", async () => {
    // Cheapest place to keep the promise: never receive it. The host's query
    // asked for an attendee list by name and address.
    //
    // Scanned from the GraphQL BODIES only, not the surrounding prose — a
    // comment explaining what was removed must not read as the thing itself.
    const source = await Bun.file(
      new URL("./fireflies.client.ts", import.meta.url).pathname,
    ).text();
    const bodies = [...source.matchAll(/const Q_[A-Z_]+ = `([^`]*)`/g)].map(
      (m) => m[1],
    );
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(/meeting_attendees/);
      expect(body).not.toMatch(/displayName/);
      expect(body).not.toMatch(/\bparticipants\b/);
    }
  });

  it("the intake table has no column that could hold a participant name", async () => {
    const rows = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'coach_intake_sessions'
    `.execute(conn);
    const names = rows.rows.map((r) => r.column_name);
    expect(names).not.toContain("participants");
    expect(names).not.toContain("attendees");
    expect(names).not.toContain("attendee_names");
  });

  it("the intake detail type exposes a COUNT, not a list", async () => {
    const source = await Bun.file(
      new URL("./fireflies.client.ts", import.meta.url).pathname,
    ).text();
    expect(source).toMatch(/participantCount: number/);
    expect(source).not.toMatch(/participantNames/);
  });

  it("the retained transcript is PSEUDONYMOUS — speakers numbered, not named", async () => {
    // The one place the promise nearly broke. Dimensions 4 and 6 need to tell
    // the leader from the room, which the provider only expresses by name — so
    // the name is used once inside the client to mark the leader and then
    // dropped. The type that leaves the client carries no name field at all.
    const source = await Bun.file(
      new URL("./fireflies.client.ts", import.meta.url).pathname,
    ).text();
    const detail = source.slice(
      source.indexOf("export interface FirefliesTranscriptDetail"),
      source.indexOf("export interface FirefliesClient"),
    );
    expect(detail).toMatch(/speakerId: string/);
    expect(detail).toMatch(/isLeader: boolean/);
    expect(detail).not.toMatch(/speaker_name/);
  });

  it("the report contract carries attendees as a number", async () => {
    const schema = await Bun.file(
      new URL("./coach.schema.ts", import.meta.url).pathname,
    ).text();
    expect(schema).toMatch(/attendees:\s*t\.Number\(\)/);
  });

  it("the deployed corpus itself only ever stored a count", async () => {
    // If any historical report carried a list, the backfill would import it and
    // the guard would be false from day one.
    const bundle = coachDataJson as unknown as {
      coaches: Array<{ reports: Array<Record<string, unknown>> }>;
    };
    for (const coach of bundle.coaches) {
      for (const report of coach.reports) {
        expect(typeof report.attendees).not.toBe("object");
      }
    }
  });
});
