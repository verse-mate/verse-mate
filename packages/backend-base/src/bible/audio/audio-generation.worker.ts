import { Worker } from "bullmq";
import { db as Database } from "database";
import bullmqRedisConnection from "../../shared/bullmq-redis";
import { ObjectStorageService } from "../../shared/storage/storage.service";
import { createTtsProvider } from "../../shared/tts/tts-provider.factory";
import {
  AUDIO_GENERATION_CONCURRENCY,
  AUDIO_GENERATION_QUEUE,
  type AudioGenerationJobData,
} from "./audio-generation.queue";
import { AudioService } from "./audio.service";

export const audioGenerationWorker = new Worker<
  AudioGenerationJobData,
  { audio_id: string }
>(
  AUDIO_GENERATION_QUEUE,
  async (job) => {
    const service = new AudioService(
      Database,
      new ObjectStorageService(),
      createTtsProvider(),
    );

    const explanation = await Database.getOrCreateConnection()
      .selectFrom("explanations")
      .select(["explanation_id", "explanation"])
      .where("explanation_id", "=", job.data.explanation_id)
      .executeTakeFirstOrThrow();

    const row = await service.synthesizeAndStore(explanation.explanation, {
      explanation_id: job.data.explanation_id,
      voice: job.data.voice,
      language_code: job.data.language_code,
    });

    return { audio_id: row.audio_id };
  },
  {
    connection: bullmqRedisConnection,
    concurrency: AUDIO_GENERATION_CONCURRENCY,
    autorun: false,
  },
);

audioGenerationWorker.on("completed", (job) => {
  console.log(
    `[AUDIO-GEN] job ${job?.id} completed → audio ${job?.returnvalue?.audio_id}`,
  );
});

audioGenerationWorker.on("failed", (job, err) => {
  console.error(`[AUDIO-GEN] job ${job?.id} failed: ${err.message}`);
});
