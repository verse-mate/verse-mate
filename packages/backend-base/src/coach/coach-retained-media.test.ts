import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  MINTED_URL_LIFETIME_SECONDS,
  RetainedMediaService,
} from "./coach-retained-media.service";

const conn = Database.getOrCreateConnection();
const OWNER = "media-owner";
const OTHER = "media-other";

class FakeStorage {
  presigns: Array<{ key: string; ttl: number }> = [];
  async getGlobalObjectUrl({
    key,
    expiresInSeconds,
  }: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    this.presigns.push({ key, ttl: expiresInSeconds ?? -1 });
    return `https://storage.test/${key}?exp=${expiresInSeconds}`;
  }
}

function service(storage = new FakeStorage()) {
  return { svc: new RetainedMediaService(Database, storage as any), storage };
}

async function seedReport(coach: string, id: string, sourceSessionId: string) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: coach,
      session_date: "2026-08-22",
      source_session_id: sourceSessionId,
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: {},
    })
    .execute();
}

async function seedAsset(
  coach: string,
  sourceSessionId: string,
  reportId: string,
) {
  await conn
    .insertInto("coach_session_assets")
    .values({
      coach_id: coach,
      source_session_id: sourceSessionId,
      report_id: reportId,
      kind: "recording",
      storage_key: `coach/sessions/${sourceSessionId}/recording.mp4`,
    })
    .execute();
}

async function clear() {
  for (const c of [OWNER, OTHER]) {
    await conn
      .deleteFrom("coach_session_assets")
      .where("coach_id", "=", c)
      .execute();
    await conn
      .deleteFrom("coach_recording_links")
      .where("coach_id", "=", c)
      .execute();
    await conn.deleteFrom("coach_reports").where("coach_id", "=", c).execute();
  }
}

describe("retained media is minted per request, never listed", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a leader gets an address for their OWN session", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc, storage } = service();

    const url = await svc.mint({
      reportId: "r-own",
      requesterCoachId: OWNER,
      isAdmin: false,
    });
    expect(url).toContain("https://storage.test/");
    expect(storage.presigns.length).toBe(1);
    expect(storage.presigns[0].key).toContain("ff-own");
  });

  it("another leader gets NO address issued, not a denied one, none minted", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc, storage } = service();

    const url = await svc.mint({
      reportId: "r-own",
      requesterCoachId: OTHER,
      isAdmin: false,
    });
    expect(url).toBeNull();
    // The point: nothing was signed, so there is no address in existence to leak.
    expect(storage.presigns.length).toBe(0);
  });

  it("an unauthenticated requester gets nothing", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc, storage } = service();

    expect(
      await svc.mint({
        reportId: "r-own",
        requesterCoachId: null,
        isAdmin: false,
      }),
    ).toBeNull();
    expect(storage.presigns.length).toBe(0);
  });

  it("the program admin reviews any session", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc } = service();

    const url = await svc.mint({
      reportId: "r-own",
      requesterCoachId: null,
      isAdmin: true,
    });
    expect(url).toBeTruthy();
  });

  it("an issued address EXPIRES, 24 hours (open question 5, provisional)", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc, storage } = service();

    await svc.mint({
      reportId: "r-own",
      requesterCoachId: OWNER,
      isAdmin: false,
    });
    expect(storage.presigns[0].ttl).toBe(MINTED_URL_LIFETIME_SECONDS);
    expect(MINTED_URL_LIFETIME_SECONDS).toBe(24 * 60 * 60);
  });

  it("a session with no retained asset mints nothing", async () => {
    await seedReport(OWNER, "r-bare", "ff-bare");
    const { svc } = service();
    expect(
      await svc.mint({
        reportId: "r-bare",
        requesterCoachId: OWNER,
        isAdmin: false,
      }),
    ).toBeNull();
  });
});

describe("the detail response says WHETHER material exists, never where", () => {
  beforeEach(clear);
  afterEach(clear);

  it("reports a retained asset as a boolean on a detail-only field", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc, storage } = service();

    const state = await svc.describe(OWNER, "r-own");
    expect(state.hasRetainedRecording).toBe(true);
    // Crucially: describing mints nothing. A paginated list calls this per row.
    expect(storage.presigns.length).toBe(0);
    expect(JSON.stringify(state)).not.toContain("storage.test");
  });

  it("an admin's pasted link takes PRECEDENCE over retained material", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    await conn
      .insertInto("coach_recording_links")
      .values({
        coach_id: OWNER,
        report_id: "r-own",
        recording_url: "https://drive.example/admin-pasted",
      })
      .execute();
    const { svc } = service();

    const state = await svc.describe(OWNER, "r-own");
    expect(state.attachedRecordingUrl).toBe(
      "https://drive.example/admin-pasted",
    );
    expect(state.preferred).toBe("attached");
  });

  it("with no pasted link, the retained asset is what the portal offers", async () => {
    await seedReport(OWNER, "r-own", "ff-own");
    await seedAsset(OWNER, "ff-own", "r-own");
    const { svc } = service();

    const state = await svc.describe(OWNER, "r-own");
    expect(state.attachedRecordingUrl).toBeNull();
    expect(state.preferred).toBe("retained");
  });

  it("a session with neither offers nothing at all", async () => {
    await seedReport(OWNER, "r-bare", "ff-bare");
    const { svc } = service();
    const state = await svc.describe(OWNER, "r-bare");
    expect(state.hasRetainedRecording).toBe(false);
    expect(state.preferred).toBe("none");
  });

  it("describing a LIST of sessions mints nothing, whatever its length", async () => {
    // The scenario: 'a session list does not fetch recordings'. Minting per row
    // would sign one URL per session on every page load, each valid for a day.
    for (let i = 0; i < 5; i += 1) {
      await seedReport(OWNER, `r-${i}`, `ff-${i}`);
      await seedAsset(OWNER, `ff-${i}`, `r-${i}`);
    }
    const { svc, storage } = service();
    const states = await svc.describeMany(OWNER, [
      "r-0",
      "r-1",
      "r-2",
      "r-3",
      "r-4",
    ]);
    expect(states.size).toBe(5);
    expect(storage.presigns.length).toBe(0);
  });
});
