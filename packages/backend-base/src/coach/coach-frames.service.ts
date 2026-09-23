import { ObjectStorageService } from "../shared/storage/storage.service";

/**
 * Frame extraction for the Visual Aids dimension (change: port-coach-pipeline,
 * task 5.4, design D9).
 *
 * Dimension 7 asks whether the leader used charts, slides, maps or on-screen
 * word-study tools. That is not in the transcript, it is only in the picture —
 * so it is the one dimension that cannot be scored from text.
 *
 * The video is STREAMED from object storage through ffmpeg's stdin and the
 * frames come back on stdout. Nothing is written to container disk: a recorded
 * session is gigabytes, the API container has no volume for it, and a
 * half-written temp file from a crashed job would sit there until someone
 * noticed.
 */

/** How many frames one session is sampled down to. */
export const FRAME_SAMPLE_COUNT = 12;

/**
 * Frames per second requested from ffmpeg. One every twenty seconds: a visual
 * aid that is on screen for less than that is not what the dimension is asking
 * about, and sampling harder multiplies vision-model cost for nothing.
 */
export const FRAME_SAMPLE_FPS = 1 / 20;

export interface ExtractedFrame {
  /** JPEG bytes. */
  data: Uint8Array;
  index: number;
}

/** Injected so the pipeline is testable without ffmpeg or a bucket. */
export interface FrameDeps {
  storage?: Pick<ObjectStorageService, "getGlobalObjectStream">;
  runFfmpeg?: (
    input: ReadableStream<Uint8Array>,
    args: string[],
  ) => Promise<Uint8Array[]>;
}

/** JPEG start-of-image / end-of-image, used to split ffmpeg's image2pipe. */
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

/**
 * Split a concatenated JPEG stream into frames.
 *
 * ffmpeg's image2pipe writes one JPEG after another with no length prefix, so
 * the boundaries have to be found in the bytes. Exported for its own test —
 * an off-by-one here silently truncates every frame and the vision model would
 * score a corrupted picture rather than fail.
 */
export function splitJpegStream(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (start === -1 && bytes[i] === SOI[0] && bytes[i + 1] === SOI[1]) {
      start = i;
      i += 1;
      continue;
    }
    if (start !== -1 && bytes[i] === EOI[0] && bytes[i + 1] === EOI[1]) {
      frames.push(bytes.slice(start, i + 2));
      start = -1;
      i += 1;
    }
  }
  return frames;
}

export class CoachFrameService {
  private readonly storage: NonNullable<FrameDeps["storage"]>;
  private readonly runFfmpeg: NonNullable<FrameDeps["runFfmpeg"]>;

  constructor(deps: FrameDeps = {}) {
    this.storage = deps.storage ?? new ObjectStorageService();
    this.runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg;
  }

  /** Up to FRAME_SAMPLE_COUNT frames, or an empty list if there is no video. */
  async extract(storageKey: string): Promise<ExtractedFrame[]> {
    const stream = await this.storage.getGlobalObjectStream(storageKey);
    if (!stream) return [];

    const frames = await this.runFfmpeg(stream, [
      "-i",
      "pipe:0",
      "-vf",
      `fps=${FRAME_SAMPLE_FPS}`,
      "-frames:v",
      String(FRAME_SAMPLE_COUNT),
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ]);

    // Cap here too, not only in the ffmpeg args: a long session can produce
    // more frames than -frames:v bounds if the filter graph rounds up, and
    // every extra frame is a vision-model call nobody asked for.
    return frames
      .slice(0, FRAME_SAMPLE_COUNT)
      .map((data, index) => ({ data, index }));
  }
}

/**
 * The real thing: pipe the object into ffmpeg and read frames off stdout.
 * Never touches container disk.
 */
async function defaultRunFfmpeg(
  input: ReadableStream<Uint8Array>,
  args: string[],
): Promise<Uint8Array[]> {
  const proc = Bun.spawn(
    ["ffmpeg", "-hide_banner", "-loglevel", "error", ...args],
    {
      stdin: input,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const out = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg exited ${code}: ${err.slice(0, 400)}`);
  }
  return splitJpegStream(out);
}
