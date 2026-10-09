import { describe, expect, it } from "bun:test";

import type { AiProvider, AiTranscription } from "../shared/ai";
import {
  SPEECH_PART_MAX_BYTES,
  speechToText,
} from "./coach-transcribe.service";

function ai(
  answers: Record<string, AiTranscription | Error>,
  seen: string[] = [],
): Pick<AiProvider, "transcribeAudio"> {
  return {
    async transcribeAudio({ file }) {
      const name = (file as { name?: string }).name ?? "";
      seen.push(name);
      const answer = answers[name];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const PARTS = [
  { path: "/tmp/part-000.mp3", seconds: 3000.48, bytes: 1_000 },
  { path: "/tmp/part-001.mp3", seconds: 1200, bytes: 1_000 },
];

describe("Transcribe an uploaded video with the time of each line (task 4.14)", () => {
  it("each part is transcribed and its offset added, so every line time is exact", async () => {
    const seen: string[] = [];
    const lines = await speechToText(
      ai(
        {
          "/tmp/part-000.mp3": {
            segments: [
              { start: 0, end: 4, text: " Welcome back, everyone. " },
              { start: 12.5, end: 15, text: "Let's pray." },
            ],
          },
          "/tmp/part-001.mp3": {
            segments: [{ start: 3.25, end: 9, text: "We're starting Amos." }],
          },
        },
        seen,
      ),
      { split: async () => PARTS, open: (path) => ({ name: path }) as never },
    ).transcribe({ recordingUrl: "https://store/rec", recordingKey: "k" });
    expect(seen).toEqual(["/tmp/part-000.mp3", "/tmp/part-001.mp3"]);
    expect(lines).toEqual([
      {
        speakerId: "speaker",
        isLeader: false,
        text: "Welcome back, everyone.",
        startTime: 0,
      },
      {
        speakerId: "speaker",
        isLeader: false,
        text: "Let's pray.",
        startTime: 12.5,
      },
      {
        speakerId: "speaker",
        isLeader: false,
        text: "We're starting Amos.",
        startTime: 3003.73,
      },
    ]);
  });

  it("the transcript carries no speaker labels", async () => {
    const lines = await speechToText(
      ai({
        "/tmp/part-000.mp3": { segments: [{ start: 0, end: 1, text: "Hi" }] },
      }),
      {
        split: async () => [PARTS[0]],
        open: (path) => ({ name: path }) as never,
      },
    ).transcribe({ recordingUrl: "u", recordingKey: "k" });
    expect(lines.every((l) => l.speakerId === "speaker" && !l.isLeader)).toBe(
      true,
    );
  });

  it("A transcription that does not complete fails with its reason", async () => {
    await expect(
      speechToText(
        ai({
          "/tmp/part-000.mp3": { segments: [] },
          "/tmp/part-001.mp3": new Error("the service timed out"),
        }),
        { split: async () => PARTS, open: (path) => ({ name: path }) as never },
      ).transcribe({ recordingUrl: "u", recordingKey: "k" }),
    ).rejects.toThrow("the service timed out");
  });

  it("a part over the service's size limit is refused rather than sent", async () => {
    await expect(
      speechToText(ai({}), {
        split: async () => [{ ...PARTS[0], bytes: SPEECH_PART_MAX_BYTES + 1 }],
        open: (path) => ({ name: path }) as never,
      }).transcribe({ recordingUrl: "u", recordingKey: "k" }),
    ).rejects.toThrow("over the speech-to-text size limit");
  });

  it("a recording with no speech found is not a transcript", async () => {
    await expect(
      speechToText(ai({ "/tmp/part-000.mp3": { segments: [] } }), {
        split: async () => [PARTS[0]],
        open: (path) => ({ name: path }) as never,
      }).transcribe({ recordingUrl: "u", recordingKey: "k" }),
    ).rejects.toThrow("no speech was found");
  });
});
