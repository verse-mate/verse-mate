import { afterEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { AiProvider } from "../shared/ai";
import { COACH_MODEL_DEFAULTS, coachModel } from "./coach-models";
import { CoachMonthlyService } from "./coach-monthly.service";
import { CoachReportBodyService } from "./coach-report-body.service";
import { CoachScoringService } from "./coach-scoring.service";
import { speechToText } from "./coach-transcribe.service";

const SETTINGS = Object.keys(COACH_MODEL_DEFAULTS) as Array<
  keyof typeof COACH_MODEL_DEFAULTS
>;
const saved = Object.fromEntries(SETTINGS.map((s) => [s, process.env[s]]));

afterEach(() => {
  for (const s of SETTINGS) {
    if (saved[s] === undefined) delete process.env[s];
    else process.env[s] = saved[s];
  }
});

const ai = {} as AiProvider;
const modelOf = (service: object) => (service as { model: string }).model;

async function transcribeModel(): Promise<string> {
  const asked: string[] = [];
  await speechToText(
    {
      async transcribeAudio({ model }) {
        asked.push(model ?? "");
        return { segments: [{ start: 0, end: 1, text: "Welcome." }] };
      },
    },
    {
      split: async () => [{ path: "/tmp/part.mp3", seconds: 1, bytes: 1 }],
      open: (path) => ({ name: path }) as never,
    },
  ).transcribe({ recordingUrl: "https://store/rec", recordingKey: "k" });
  return asked[0];
}

const used = {
  COACH_SCORING_MODEL: async () =>
    modelOf(new CoachScoringService(Database, ai)),
  COACH_BODY_MODEL: async () => modelOf(new CoachReportBodyService(ai)),
  COACH_MONTHLY_MODEL: async () =>
    modelOf(new CoachMonthlyService(Database, ai, null)),
  COACH_TRANSCRIBE_MODEL: transcribeModel,
};

describe("each coach model is its own setting", () => {
  it("the defaults are unchanged from the code: scoring gpt-6-astra, body and monthly gpt-5, transcription whisper-1", () => {
    expect(COACH_MODEL_DEFAULTS).toEqual({
      COACH_SCORING_MODEL: "gpt-6-astra",
      COACH_BODY_MODEL: "gpt-5",
      COACH_MONTHLY_MODEL: "gpt-5",
      COACH_TRANSCRIBE_MODEL: "whisper-1",
    });
  });

  for (const setting of SETTINGS) {
    it(`${setting} unset or blank uses the default, set uses its value`, async () => {
      delete process.env[setting];
      expect(coachModel(setting)).toBe(COACH_MODEL_DEFAULTS[setting]);
      expect(await used[setting]()).toBe(COACH_MODEL_DEFAULTS[setting]);
      process.env[setting] = "  ";
      expect(await used[setting]()).toBe(COACH_MODEL_DEFAULTS[setting]);
      process.env[setting] = " model-under-test ";
      expect(coachModel(setting)).toBe("model-under-test");
      expect(await used[setting]()).toBe("model-under-test");
    });
  }
});
