import { describe, expect, it } from "bun:test";

import {
  CoachFrameService,
  FRAME_SAMPLE_COUNT,
  FRAME_SAMPLE_FPS,
  splitJpegStream,
} from "./coach-frames.service";

function jpeg(marker: number, size = 6): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8; // SOI
  bytes.fill(marker, 2, size - 2);
  bytes[size - 2] = 0xff;
  bytes[size - 1] = 0xd9; // EOI
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

class FakeStorage {
  requested: string[] = [];
  constructor(private readonly present = true) {}
  async getGlobalObjectStream(
    key: string,
  ): Promise<ReadableStream<Uint8Array> | null> {
    this.requested.push(key);
    return this.present ? streamOf(new Uint8Array([1, 2, 3])) : null;
  }
}

describe("splitting ffmpeg's concatenated JPEG output", () => {
  it("recovers each frame whole", () => {
    // image2pipe writes one JPEG after another with no length prefix, so the
    // boundaries live in the bytes. An off-by-one here truncates every frame
    // and the vision model scores a corrupted picture rather than failing.
    const frames = splitJpegStream(
      concat([jpeg(0xaa), jpeg(0xbb), jpeg(0xcc)]),
    );
    expect(frames.length).toBe(3);
    for (const f of frames) {
      expect(f[0]).toBe(0xff);
      expect(f[1]).toBe(0xd8);
      expect(f[f.length - 2]).toBe(0xff);
      expect(f[f.length - 1]).toBe(0xd9);
    }
    expect(frames[1][2]).toBe(0xbb);
  });

  it("returns nothing for output with no complete frame", () => {
    expect(splitJpegStream(new Uint8Array([0xff, 0xd8, 0x01])).length).toBe(0);
    expect(splitJpegStream(new Uint8Array()).length).toBe(0);
  });
});

describe("frames are extracted by streaming, never via container disk", () => {
  it("pipes the object into ffmpeg's stdin and reads frames from stdout", async () => {
    let seenArgs: string[] = [];
    const storage = new FakeStorage();
    const svc = new CoachFrameService({
      storage,
      runFfmpeg: async (_input, args) => {
        seenArgs = args;
        return [jpeg(0x11), jpeg(0x22)];
      },
    });

    const frames = await svc.extract("coach/sessions/ff-1/recording.mp4");
    expect(frames.length).toBe(2);
    expect(frames[0].index).toBe(0);
    expect(storage.requested).toEqual(["coach/sessions/ff-1/recording.mp4"]);

    // A recorded session is gigabytes and the container has no volume for it.
    expect(seenArgs).toContain("pipe:0");
    expect(seenArgs).toContain("pipe:1");
    expect(seenArgs.join(" ")).not.toMatch(/\/tmp|\.mp4|\.jpg/);
    expect(seenArgs.join(" ")).toContain(`fps=${FRAME_SAMPLE_FPS}`);
  });

  it("caps the frame count even if ffmpeg returns more", async () => {
    // Every extra frame is a vision-model call nobody asked for.
    const svc = new CoachFrameService({
      storage: new FakeStorage(),
      runFfmpeg: async () =>
        Array.from({ length: FRAME_SAMPLE_COUNT + 20 }, (_, i) => jpeg(i)),
    });
    const frames = await svc.extract("k");
    expect(frames.length).toBe(FRAME_SAMPLE_COUNT);
  });

  it("a session with no stored video yields no frames and calls no ffmpeg", async () => {
    let called = false;
    const svc = new CoachFrameService({
      storage: new FakeStorage(false),
      runFfmpeg: async () => {
        called = true;
        return [];
      },
    });
    expect(await svc.extract("missing")).toEqual([]);
    expect(called).toBe(false);
  });
});
