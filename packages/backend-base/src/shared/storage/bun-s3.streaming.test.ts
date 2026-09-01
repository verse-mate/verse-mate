import { describe, expect, it } from "bun:test";

import { BunS3Helper, MAX_STREAMED_OBJECT_BYTES } from "./bun-s3.helper";

/**
 * Task 4.3b. Before this, the whole storage surface was buffer-only:
 * `putObject(Buffer)` and a `getObjectBytes` that materialised the entire
 * object through `arrayBuffer()`. Design D9's staged-and-streamed session video
 * and D10's Range support had no API to call, and a single PUT caps at S3's
 * 5 GB single-object limit — below what a long recorded session reaches.
 */

interface FakeWriter {
  chunks: Uint8Array[];
  ended: boolean;
}

function fakeClient(stored: Map<string, Uint8Array>) {
  const writers: FakeWriter[] = [];
  return {
    writers,
    client: {
      file(key: string) {
        return {
          async exists() {
            return stored.has(key);
          },
          async write(body: Uint8Array) {
            stored.set(key, body);
          },
          async arrayBuffer() {
            const v = stored.get(key);
            if (!v) throw new Error("no such key");
            return v.buffer.slice(
              v.byteOffset,
              v.byteOffset + v.byteLength,
            ) as ArrayBuffer;
          },
          async text() {
            return new TextDecoder().decode(
              stored.get(key) ?? new Uint8Array(),
            );
          },
          async delete() {
            stored.delete(key);
          },
          stream() {
            const v = stored.get(key) ?? new Uint8Array();
            return new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(v);
                controller.close();
              },
            });
          },
          slice(start: number, end?: number) {
            const v = stored.get(key) ?? new Uint8Array();
            const part = v.slice(start, end);
            return {
              async arrayBuffer() {
                return part.buffer.slice(
                  part.byteOffset,
                  part.byteOffset + part.byteLength,
                ) as ArrayBuffer;
              },
            };
          },
          writer(_opts?: { partSize?: number }) {
            const w: FakeWriter = { chunks: [], ended: false };
            writers.push(w);
            return {
              write(chunk: Uint8Array) {
                w.chunks.push(chunk);
                return chunk.byteLength;
              },
              async end() {
                w.ended = true;
                const total = w.chunks.reduce((n, c) => n + c.byteLength, 0);
                const merged = new Uint8Array(total);
                let at = 0;
                for (const c of w.chunks) {
                  merged.set(c, at);
                  at += c.byteLength;
                }
                stored.set(key, merged);
              },
            };
          },
        };
      },
      presign() {
        return "https://example.test/presigned";
      },
    },
  };
}

function helperWith(stored = new Map<string, Uint8Array>()) {
  const fake = fakeClient(stored);
  // biome-ignore lint/suspicious/noExplicitAny: injecting a test double
  const helper = new BunS3Helper("", "", "bucket", "", "", fake.client as any);
  return { helper, stored, fake };
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

describe("object storage can stream, not only buffer", () => {
  it("a streamed put uploads in parts, never materialising the whole object", async () => {
    const { helper, stored, fake } = helperWith();
    const chunks = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8]),
    ];

    const written = await helper.putObjectStream(
      "coach/ff-1/recording.mp4",
      streamOf(chunks),
      "video/mp4",
    );

    expect(written).toBe(8);
    expect(fake.writers.length).toBe(1);
    expect(fake.writers[0].ended).toBe(true);
    // Parts arrived separately — the point of the exercise.
    expect(fake.writers[0].chunks.length).toBe(3);
    expect([...(stored.get("coach/ff-1/recording.mp4") as Uint8Array)]).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
  });

  it("a streamed get returns a stream, not the whole object in memory", async () => {
    const stored = new Map([["k", new Uint8Array([9, 9, 9])]]);
    const { helper } = helperWith(stored);

    const stream = await helper.getObjectStream("k");
    expect(stream).toBeInstanceOf(ReadableStream);

    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    const { value } = await reader.read();
    expect([...(value as Uint8Array)]).toEqual([9, 9, 9]);
  });

  it("a missing key streams null rather than throwing", async () => {
    const { helper } = helperWith();
    expect(await helper.getObjectStream("absent")).toBeNull();
  });

  it("a ranged get returns only the requested bytes — what a video element asks for", async () => {
    const stored = new Map([["k", new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])]]);
    const { helper } = helperWith(stored);

    const part = await helper.getObjectRange("k", 2, 5);
    expect([...(part as Uint8Array)]).toEqual([2, 3, 4, 5]);
  });

  it("a range is inclusive at both ends, as HTTP Range is", async () => {
    const stored = new Map([["k", new Uint8Array([0, 1, 2, 3])]]);
    const { helper } = helperWith(stored);
    expect([
      ...((await helper.getObjectRange("k", 0, 0)) as Uint8Array),
    ]).toEqual([0]);
    expect([
      ...((await helper.getObjectRange("k", 3, 3)) as Uint8Array),
    ]).toEqual([3]);
  });

  it("an open-ended range runs to the end of the object", async () => {
    const stored = new Map([["k", new Uint8Array([0, 1, 2, 3])]]);
    const { helper } = helperWith(stored);
    expect([...((await helper.getObjectRange("k", 2)) as Uint8Array)]).toEqual([
      2, 3,
    ]);
  });

  it("states an upper size, and it is far above the single-PUT 5 GB cap", async () => {
    // The number the task asks to be stated, derived rather than asserted:
    // S3 allows 10,000 parts, and the helper's part size sets the ceiling.
    expect(MAX_STREAMED_OBJECT_BYTES).toBeGreaterThan(5 * 1024 ** 3);
  });
});
