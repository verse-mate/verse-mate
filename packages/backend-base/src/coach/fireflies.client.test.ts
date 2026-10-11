import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { HttpFirefliesClient } from "./fireflies.client";

/**
 * The pseudonymisation, tested by RUNNING it.
 *
 * `coach-no-participant-names.test.ts` reads this module as source text and
 * greps its type declarations. Types are erased at runtime, so neither can
 * observe behaviour: replacing the whole speaker mapping with a passthrough of
 * the provider's sentences left the entire suite green while `speaker_name`
 * flowed verbatim into the retained transcript. `coach-archive.test.ts` cannot
 * catch it either, its FakeClient returns a fixture and never runs this code.
 *
 * This drives the real client over a stubbed fetch, which is the only place the
 * mapping actually happens.
 */

const ORIGINAL_KEY = process.env.FIREFLIES_API_KEY;

function transcriptResponse(sentences: unknown[]) {
  return new Response(
    JSON.stringify({
      data: {
        transcript: {
          id: "ff-1",
          title: "Obadiah, Lesson 4",
          host_email: "fred@fireflies.ai",
          organizer_email: "fred@fireflies.ai",
          dateString: "2026-08-22T14:00:00.000Z",
          duration: 62,
          audio_url: null,
          video_url: "https://cdn.fireflies.ai/rec/abc.mp4",
          transcript_url: null,
          speakers: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
          summary: { overview: "ok" },
          sentences,
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** What the provider really sends: a NAME on every line. */
const PROVIDER_SENTENCES = [
  {
    index: 0,
    speaker_name: "Bryan Bailey",
    text: "welcome everyone",
    start_time: 0,
    end_time: 2,
  },
  {
    index: 1,
    speaker_name: "Chris Doe",
    text: "glad to be here",
    start_time: 2,
    end_time: 4,
  },
  {
    index: 2,
    speaker_name: "Bryan Bailey",
    text: "let us read Obadiah",
    start_time: 4,
    end_time: 7,
  },
  {
    index: 3,
    speaker_name: "Dana Roe",
    text: "verse three stood out",
    start_time: 7,
    end_time: 9,
  },
];

beforeEach(() => {
  process.env.FIREFLIES_API_KEY = "ff-test-key";
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined)
    Reflect.deleteProperty(process.env, "FIREFLIES_API_KEY");
  else process.env.FIREFLIES_API_KEY = ORIGINAL_KEY;
});

describe("the client pseudonymises speakers before anything downstream sees them", () => {
  it("no returned sentence carries a participant NAME, in any field", async () => {
    const f = spyOn(globalThis, "fetch").mockImplementation(async () =>
      transcriptResponse(PROVIDER_SENTENCES),
    );
    const detail = await new HttpFirefliesClient().getTranscript(
      "ff-1",
      "Bryan Bailey",
    );
    f.mockRestore();

    const serialized = JSON.stringify(detail?.sentences);
    for (const name of [
      "Bryan Bailey",
      "Chris Doe",
      "Dana Roe",
      "speaker_name",
    ]) {
      expect(serialized).not.toContain(name);
    }
    // Exactly the pseudonymous shape, nothing extra smuggled alongside.
    for (const s of detail?.sentences ?? []) {
      expect(Object.keys(s).sort()).toEqual([
        "end_time",
        "index",
        "isLeader",
        "speakerId",
        "start_time",
        "text",
      ]);
    }
  });

  it("distinct speakers get distinct, STABLE ids, and a repeat speaker reuses theirs", async () => {
    // Dimensions 4 and 6 count who spoke; if the same person got two ids, or
    // two people shared one, both scores would be wrong.
    const f = spyOn(globalThis, "fetch").mockImplementation(async () =>
      transcriptResponse(PROVIDER_SENTENCES),
    );
    const detail = await new HttpFirefliesClient().getTranscript(
      "ff-1",
      "Bryan Bailey",
    );
    f.mockRestore();

    const ids = (detail?.sentences ?? []).map((s) => s.speakerId);
    expect(ids[0]).toBe(ids[2]); // Bryan spoke twice
    expect(new Set(ids).size).toBe(3); // three distinct people
    expect(ids.every((i) => /^speaker-\d+$/.test(i))).toBe(true);
  });

  it("marks the LEADER and nobody else", async () => {
    const f = spyOn(globalThis, "fetch").mockImplementation(async () =>
      transcriptResponse(PROVIDER_SENTENCES),
    );
    const detail = await new HttpFirefliesClient().getTranscript(
      "ff-1",
      "Bryan Bailey",
    );
    f.mockRestore();

    const flags = (detail?.sentences ?? []).map((s) => s.isLeader);
    expect(flags).toEqual([true, false, true, false]);
  });

  it("matches a partial provider label against the roster name, both directions", async () => {
    // The provider labels a speaker "Bryan" where the roster says "Bryan
    // Bailey", and sometimes the reverse. Dimensions 4 and 6 depend on this.
    const f = spyOn(globalThis, "fetch").mockImplementation(async () =>
      transcriptResponse([
        {
          index: 0,
          speaker_name: "Bryan",
          text: "a",
          start_time: 0,
          end_time: 1,
        },
        {
          index: 1,
          speaker_name: "Someone Else",
          text: "b",
          start_time: 1,
          end_time: 2,
        },
      ]),
    );
    const detail = await new HttpFirefliesClient().getTranscript(
      "ff-1",
      "Bryan Bailey",
    );
    f.mockRestore();
    expect((detail?.sentences ?? []).map((s) => s.isLeader)).toEqual([
      true,
      false,
    ]);
  });

  it("with NO leader name known, nobody is marked the leader", async () => {
    // An unattributed session must not silently promote speaker-1.
    const f = spyOn(globalThis, "fetch").mockImplementation(async () =>
      transcriptResponse(PROVIDER_SENTENCES),
    );
    const detail = await new HttpFirefliesClient().getTranscript("ff-1", null);
    f.mockRestore();
    expect((detail?.sentences ?? []).every((s) => s.isLeader === false)).toBe(
      true,
    );
  });

  it("participantCount is a COUNT, and no roster is requested", async () => {
    let sentBody = "";
    const f = spyOn(globalThis, "fetch").mockImplementation(
      async (_u: unknown, init?: unknown) => {
        sentBody = String((init as { body?: string })?.body ?? "");
        return transcriptResponse(PROVIDER_SENTENCES);
      },
    );
    const detail = await new HttpFirefliesClient().getTranscript(
      "ff-1",
      "Bryan Bailey",
    );
    f.mockRestore();

    expect(detail?.participantCount).toBe(3);
    expect(sentBody).not.toContain("meeting_attendees");
    expect(sentBody).not.toContain("displayName");
  });

  it("an unnamed speaker still gets an id rather than colliding with everyone", async () => {
    const f = spyOn(globalThis, "fetch").mockImplementation(async () =>
      transcriptResponse([
        { index: 0, speaker_name: null, text: "a", start_time: 0, end_time: 1 },
        {
          index: 1,
          speaker_name: "Bryan Bailey",
          text: "b",
          start_time: 1,
          end_time: 2,
        },
      ]),
    );
    const detail = await new HttpFirefliesClient().getTranscript(
      "ff-1",
      "Bryan Bailey",
    );
    f.mockRestore();
    const ids = (detail?.sentences ?? []).map((s) => s.speakerId);
    expect(new Set(ids).size).toBe(2);
    // And an empty label must not be read as matching the leader.
    expect((detail?.sentences ?? [])[0].isLeader).toBe(false);
  });
});

describe("the credential is attached, and stays out of everything else", () => {
  it("sends the API key as a bearer token", async () => {
    // Nothing asserted this at all. Read through a Headers object rather than
    // the literal, because header names are case-insensitive there and a
    // `headers.Authorization` property read on a Headers instance is always
    // undefined, which is how this kind of assertion passes while proving
    // nothing.
    let init: RequestInit | undefined;
    const f = spyOn(globalThis, "fetch").mockImplementation(
      async (_url: string | URL | Request, got?: RequestInit) => {
        init = got;
        return transcriptResponse(PROVIDER_SENTENCES);
      },
    );
    await new HttpFirefliesClient().getTranscript("ff-1", "Bryan Bailey");
    f.mockRestore();

    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer ff-test-key");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("a provider error does NOT quote the key back into the message", async () => {
    // The message reaches logs and the worker's job record.
    const f = spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );
    let message = "";
    try {
      await new HttpFirefliesClient().getTranscript("ff-1", "Bryan Bailey");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    f.mockRestore();

    expect(message).toContain("401");
    expect(message).not.toContain("ff-test-key");
  });
});
