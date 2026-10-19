import { describe, expect, it } from "bun:test";

import { BunS3Helper } from "./bun-s3.helper";

const PRESIGNED =
  "https://bucket.example.test/rec/coach/ff-1/recording.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AK%2F20261019%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261019T135018Z&X-Amz-Expires=3600&X-Amz-Signature=00&X-Amz-SignedHeaders=host";

interface SentRequest {
  method: string;
  url: URL;
  body: Uint8Array | null;
  contentType: string | null;
}

function fakeS3(options: { failPart?: number } = {}) {
  const requests: SentRequest[] = [];
  const parts = new Map<number, Uint8Array>();
  let completed: Uint8Array | null = null;
  let aborted = false;
  let produced = 0;
  const producedAtFirstPart: number[] = [];

  const send = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body =
      init.body === undefined || init.body === null
        ? null
        : typeof init.body === "string"
          ? new TextEncoder().encode(init.body)
          : new Uint8Array(init.body as Uint8Array);
    const headers = new Headers(init.headers);
    requests.push({
      method,
      url,
      body,
      contentType: headers.get("content-type"),
    });
    const q = url.searchParams;
    if (method === "POST" && q.has("uploads"))
      return new Response(
        "<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>",
      );
    if (method === "PUT" && q.get("uploadId") === "up-1") {
      const n = Number(q.get("partNumber"));
      if (parts.size === 0) producedAtFirstPart.push(produced);
      if (n === options.failPart)
        return new Response("slow down", { status: 503 });
      parts.set(n, body ?? new Uint8Array());
      return new Response(null, { headers: { etag: `"etag-${n}"` } });
    }
    if (method === "POST" && q.get("uploadId") === "up-1") {
      const xml = new TextDecoder().decode(body ?? new Uint8Array());
      const numbers = [...xml.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map(
        (m) => Number(m[1]),
      );
      const etags = [...xml.matchAll(/<ETag>([^<]+)<\/ETag>/g)].map(
        (m) => m[1],
      );
      expect(etags).toEqual(numbers.map((n) => `"etag-${n}"`));
      const all = numbers.map((n) => parts.get(n) as Uint8Array);
      completed = new Uint8Array(all.reduce((s, p) => s + p.byteLength, 0));
      let at = 0;
      for (const p of all) {
        completed.set(p, at);
        at += p.byteLength;
      }
      return new Response("<CompleteMultipartUploadResult/>");
    }
    if (method === "DELETE" && q.get("uploadId") === "up-1") {
      aborted = true;
      return new Response(null, { status: 204 });
    }
    return new Response("unexpected", { status: 400 });
  };

  const source = (chunks: number, chunkSize: number) => {
    let i = 0;
    return new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (i === chunks) return controller.close();
          controller.enqueue(new Uint8Array(chunkSize).fill(i % 251));
          produced += chunkSize;
          i += 1;
        },
      },
      { highWaterMark: 0 },
    );
  };

  return {
    send,
    source,
    requests,
    parts,
    producedAtFirstPart,
    completed: () => completed,
    aborted: () => aborted,
  };
}

function helperWith(s3: ReturnType<typeof fakeS3>, partSize: number) {
  const client = { presign: () => PRESIGNED };
  return new BunS3Helper(
    "",
    "us-east-1",
    "rec",
    "AK",
    "SK",
    client as any,
    s3.send as typeof fetch,
    partSize,
  );
}

describe("a streamed put is a multipart upload that holds one part at a time", () => {
  it("stores every byte, in parts of the part size, and completes with their etags", async () => {
    const s3 = fakeS3();
    const written = await helperWith(s3, 10).putObjectStream(
      "coach/ff-1/recording.mp4",
      s3.source(7, 4),
      "video/mp4",
    );

    expect(written).toBe(28);
    expect([...s3.parts.keys()]).toEqual([1, 2, 3]);
    expect([...s3.parts.values()].map((p) => p.byteLength)).toEqual([
      10, 10, 8,
    ]);
    const expected = new Uint8Array(28);
    for (let i = 0; i < 7; i += 1) expected.fill(i, i * 4, i * 4 + 4);
    expect([...(s3.completed() as Uint8Array)]).toEqual([...expected]);
    expect(s3.requests[0].contentType).toBe("video/mp4");
  });

  it("uploads a part before reading past it, so a fast download cannot outrun the upload", async () => {
    const s3 = fakeS3();
    await helperWith(s3, 10).putObjectStream(
      "k",
      s3.source(50, 4),
      "video/mp4",
    );

    expect(s3.producedAtFirstPart[0]).toBeLessThanOrEqual(10 + 4);
  });

  it("signs every call for its own method and multipart query", async () => {
    const s3 = fakeS3();
    await helperWith(s3, 10).putObjectStream("k", s3.source(3, 4), "video/mp4");

    for (const r of s3.requests) {
      expect(r.url.searchParams.get("X-Amz-Signature")).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(r.url.searchParams.get("X-Amz-Signature")).not.toBe("00");
    }
    const signatures = new Set(
      s3.requests.map((r) => r.url.searchParams.get("X-Amz-Signature")),
    );
    expect(signatures.size).toBe(s3.requests.length);
  });

  it("aborts the upload and fails when a part is refused, leaving nothing behind", async () => {
    const s3 = fakeS3({ failPart: 2 });
    const error = await helperWith(s3, 10)
      .putObjectStream("k", s3.source(7, 4), "video/mp4")
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(s3.aborted()).toBe(true);
    expect(s3.completed()).toBeNull();
  });

  it("aborts when the source stream fails", async () => {
    const s3 = fakeS3();
    let pulls = 0;
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 4) controller.error(new Error("download dropped"));
        else controller.enqueue(new Uint8Array(4));
      },
    });
    const error = await helperWith(s3, 10)
      .putObjectStream("k", failing, "video/mp4")
      .catch((e: Error) => e);

    expect((error as Error).message).toContain("download dropped");
    expect(s3.aborted()).toBe(true);
    expect(s3.completed()).toBeNull();
  });

  it("an empty stream stores an empty object", async () => {
    const s3 = fakeS3();
    const written = await helperWith(s3, 10).putObjectStream(
      "k",
      s3.source(0, 4),
      "video/mp4",
    );

    expect(written).toBe(0);
    expect(s3.completed()?.byteLength).toBe(0);
  });
});
