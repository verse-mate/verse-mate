export const COACH_MODEL_DEFAULTS = {
  COACH_SCORING_MODEL: "gpt-6-astra",
  COACH_BODY_MODEL: "gpt-5",
  COACH_MONTHLY_MODEL: "gpt-5",
  COACH_TRANSCRIBE_MODEL: "whisper-1",
} as const;

export function coachModel(setting: keyof typeof COACH_MODEL_DEFAULTS): string {
  return process.env[setting]?.trim() || COACH_MODEL_DEFAULTS[setting];
}
