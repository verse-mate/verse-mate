import { Queue } from "bullmq";
import bullmqRedisConnection from "../../shared/bullmq-redis";

export const AUDIO_GENERATION_QUEUE = "audio-generation";

export const AUDIO_GENERATION_CONCURRENCY = 1;

export interface AudioGenerationJobData {
  explanation_id: number;
  voice: string;
  language_code: string;
}

export const audioGenerationQueue = new Queue<AudioGenerationJobData>(
  AUDIO_GENERATION_QUEUE,
  {
    connection: bullmqRedisConnection,
  },
);

/**
 * Deterministic job id for deduplication (br-audio-006).
 * Two requests for the same (explanation_id, voice, language_code) map to the same id
 * while the job is waiting/active, preventing duplicate enqueues.
 */
export function audioGenerationJobId(data: AudioGenerationJobData): string {
  return `audio-gen:${data.explanation_id}:${data.voice}:${data.language_code}`;
}
