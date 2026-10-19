import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  NOTETAKER_TOKEN,
  NOTETAKER_URL,
  isTimeZone,
  notetakerTokenOk,
  notetakerZoom,
  pingNotetaker,
  zoomMeetingId,
} from "./coach-notetaker";

const saved = {
  url: process.env[NOTETAKER_URL],
  token: process.env[NOTETAKER_TOKEN],
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("the notetaker link", () => {
  beforeEach(() => {
    process.env[NOTETAKER_URL] = "https://notetaker.example/";
    process.env[NOTETAKER_TOKEN] = "shared-token";
  });
  afterEach(() => {
    restore(NOTETAKER_URL, saved.url);
    restore(NOTETAKER_TOKEN, saved.token);
  });

  it("accepts only its own bearer token, and none when the token is unset", () => {
    expect(notetakerTokenOk("Bearer shared-token")).toBe(true);
    expect(notetakerTokenOk("Bearer shared-tokeN")).toBe(false);
    expect(notetakerTokenOk("shared-token")).toBe(false);
    expect(notetakerTokenOk(undefined)).toBe(false);
    delete process.env[NOTETAKER_TOKEN];
    expect(notetakerTokenOk("Bearer ")).toBe(false);
  });

  it("tells the notetaker the classes changed, with its token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await pingNotetaker(async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://notetaker.example/versemate/classes-changed",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(
      (calls[0]?.init?.headers as Record<string, string>).authorization,
    ).toBe("Bearer shared-token");
  });

  it("never throws when the notetaker is down, and sends nothing when unconfigured", async () => {
    await pingNotetaker(async () => {
      throw new Error("connection refused");
    });
    delete process.env[NOTETAKER_URL];
    let called = false;
    await pingNotetaker(async () => {
      called = true;
      return new Response(null);
    });
    expect(called).toBe(false);
  });

  it("maps the notetaker's Zoom overview to Class Setup's terms", async () => {
    const zoom = await notetakerZoom(
      async () =>
        new Response(
          JSON.stringify({
            connections: [
              {
                email: "Coach@Example.com",
                name: "Bryan B",
                connected_at: "2026-10-19T18:00:00+00:00",
              },
            ],
            meetings: [
              {
                meeting_id: "111",
                topic: "Saturday study",
                join_url: "https://zoom.us/j/111?pwd=a",
                host_email: "coach@example.com",
                class_date: "2026-10-24",
                start_time: "07:00",
                time_zone: "America/Chicago",
                recurrence: "weekly",
                invited: false,
              },
            ],
          }),
        ),
    );
    expect(zoom?.connections).toEqual([
      {
        email: "coach@example.com",
        name: "Bryan B",
        connectedAt: "2026-10-19T18:00:00+00:00",
      },
    ]);
    expect(zoom?.meetings[0]).toEqual({
      meetingId: "111",
      topic: "Saturday study",
      joinUrl: "https://zoom.us/j/111?pwd=a",
      hostEmail: "coach@example.com",
      classDate: "2026-10-24",
      startTime: "07:00",
      timeZone: "America/Chicago",
      recurrence: "weekly",
      invited: false,
    });
  });

  it("answers null when the notetaker refuses or is unreachable", async () => {
    expect(
      await notetakerZoom(async () => new Response("no", { status: 401 })),
    ).toBeNull();
    expect(
      await notetakerZoom(async () => {
        throw new Error("timeout");
      }),
    ).toBeNull();
  });
});

describe("class fields the notetaker depends on", () => {
  it("reads the meeting id out of any Zoom join link", () => {
    expect(zoomMeetingId("https://us02web.zoom.us/j/81234567890?pwd=x")).toBe(
      "81234567890",
    );
    expect(zoomMeetingId("https://zoom.us/w/123")).toBe("123");
    expect(zoomMeetingId("https://meet.google.com/abc-defg-hij")).toBeNull();
  });

  it("knows IANA zones and refuses made-up ones", () => {
    expect(isTimeZone("America/Chicago")).toBe(true);
    expect(isTimeZone("Europe/Bucharest")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
  });
});
