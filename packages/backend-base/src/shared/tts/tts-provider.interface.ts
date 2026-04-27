export type AudioFormat = "mp3";

export interface SynthesizeInput {
  text: string;
  voice: string;
  language: string;
  format: AudioFormat;
}

export interface SynthesizeOutput {
  audio: Buffer;
  duration_seconds: number;
  character_count: number;
  model_version: string;
}

export interface Voice {
  id: string;
  language: string;
  label: string;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(input: SynthesizeInput): Promise<SynthesizeOutput>;
  listVoices(language: string): Promise<Voice[]>;
}
