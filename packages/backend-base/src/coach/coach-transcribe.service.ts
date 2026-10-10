import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AiProvider } from "../shared/ai";
import { mediaInput } from "./coach-media-input";
import type { TimedLine } from "./coach-transcript";
import {
  type Transcriber,
  UPLOAD_MAX_SECONDS,
  ffprobeWith,
} from "./coach-upload-media.service";

export const SPEECH_PART_MAX_BYTES = 24 * 1024 ** 2;
export const SPEECH_PART_SECONDS = 3000;
export const SPEECH_MODEL = "whisper-1";

export interface AudioPart {
  path: string;
  seconds: number;
  bytes: number;
}

export async function splitAudio(
  recordingUrl: string,
  dir: string,
): Promise<AudioPart[]> {
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      ...mediaInput(),
      "-i",
      recordingUrl,
      "-t",
      String(UPLOAD_MAX_SECONDS),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      "-f",
      "segment",
      "-segment_time",
      String(SPEECH_PART_SECONDS),
      "-reset_timestamps",
      "1",
      join(dir, "part-%03d.mp3"),
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [err, code] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0)
    throw new Error(
      `the audio could not be extracted (ffmpeg exited ${code}: ${err.slice(0, 200)})`,
    );
  const names = (await readdir(dir)).filter((n) => n.endsWith(".mp3")).sort();
  const parts: AudioPart[] = [];
  for (const name of names) {
    const path = join(dir, name);
    parts.push({
      path,
      seconds: (await ffprobeWith("mp3").probe(path)).seconds,
      bytes: (await stat(path)).size,
    });
  }
  return parts;
}

export function speechToText(
  ai: Pick<AiProvider, "transcribeAudio">,
  deps: {
    split?: (recordingUrl: string, dir: string) => Promise<AudioPart[]>;
    open?: (path: string) => Blob;
  } = {},
): Transcriber {
  const split = deps.split ?? splitAudio;
  const open = deps.open ?? ((path: string) => Bun.file(path));
  return {
    async transcribe({ recordingUrl }) {
      if (!ai.transcribeAudio)
        throw new Error("speech-to-text is not set up on this server");
      const dir = await mkdtemp(join(tmpdir(), "coach-speech-"));
      try {
        const parts = await split(recordingUrl, dir);
        const lines: TimedLine[] = [];
        let offset = 0;
        for (const part of parts) {
          if (part.bytes > SPEECH_PART_MAX_BYTES)
            throw new Error(
              "an audio part is over the speech-to-text size limit",
            );
          const heard = await ai.transcribeAudio({
            file: open(part.path),
            model: SPEECH_MODEL,
          });
          for (const segment of heard.segments) {
            const text = segment.text.trim();
            if (text)
              lines.push({
                speakerId: "speaker",
                isLeader: false,
                text,
                startTime: Math.round((offset + segment.start) * 100) / 100,
              });
          }
          offset += part.seconds;
        }
        if (lines.length === 0) throw new Error("no speech was found");
        return lines;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
