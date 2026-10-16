import { createHash, createHmac } from "node:crypto";

import { InternalServerError } from "../../common/errors";

// Bun's S3Client is a global. The TS types may need `@types/bun` >= 1.x.
declare const Bun: {
  S3Client: new (config: {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    endpoint?: string;
    region?: string;
  }) => {
    file(key: string): {
      exists(): Promise<boolean>;
      stat(): Promise<{ size: number }>;
      write(
        body: Buffer | Uint8Array | string,
        opts?: { type?: string },
      ): Promise<void>;
      arrayBuffer(): Promise<ArrayBuffer>;
      text(): Promise<string>;
      delete(): Promise<void>;
      /** Byte range as its own lazily-read file handle. */
      slice(
        start: number,
        end?: number,
      ): { arrayBuffer(): Promise<ArrayBuffer> };
      /** The object as a stream, never materialised whole. */
      stream(): ReadableStream<Uint8Array>;
    };
    presign(
      key: string,
      opts: { method?: "GET" | "PUT" | "DELETE"; expiresIn: number },
    ): string;
    list(opts: { prefix: string; startAfter?: string }): Promise<{
      isTruncated?: boolean;
      contents?: Array<{ key: string; lastModified?: string }>;
    }>;
  };
};
type BunS3Client = ReturnType<
  typeof Bun.S3Client extends new (...args: any[]) => infer R ? () => R : never
>;

/**
 * Multipart part size. S3 allows at most 10,000 parts per object, so this
 * number times 10,000 IS the supported object ceiling, task 4.3b asks for that
 * ceiling to be stated rather than discovered by a failed upload.
 */
export const MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024;

/** S3's hard limit on parts in one multipart upload. */
const S3_MAX_PARTS = 10_000;

/**
 * The largest object this helper can store: ~160 GB.
 *
 * Worth stating because the surface it replaces could not say this. A single
 * PUT, the only thing `putObject` ever did, caps at S3's 5 GB single-object
 * limit, which a long recorded session can exceed, and the failure arrives at
 * upload time with no warning beforehand.
 */
const MULTIPART_URL_LIFETIME_SECONDS = 6 * 60 * 60;

export const MAX_STREAMED_OBJECT_BYTES =
  MULTIPART_PART_SIZE_BYTES * S3_MAX_PARTS;

/**
 * Bun-native S3 helper.
 *
 * Per spec feat-integrations br-int-003 (Phase 1 decision D-002): the
 * production object-storage path. `ObjectStorageService` delegates to this
 * helper; @aws-sdk is no longer used. Identical S3-compatible behavior
 * against MinIO local and DigitalOcean Spaces production.
 *
 * Bucket-level provisioning (createBucket, putBucketPolicy) is intentionally
 * not modeled here, buckets are pre-provisioned at the infrastructure layer.
 */
export class BunS3Helper {
  private readonly client: BunS3Client;
  readonly bucket: string;

  constructor(
    endpoint: string,
    region: string,
    bucket: string,
    accessKeyId: string,
    private readonly secretAccessKey: string,
    /**
     * An injected client. Only the streaming tests pass one: the multipart and
     * range paths are the parts most worth covering and the ones a live bucket
     * makes slowest to exercise.
     */
    client?: BunS3Client,
    private readonly send: typeof fetch = fetch,
    private readonly partSize: number = MULTIPART_PART_SIZE_BYTES,
  ) {
    this.client =
      client ??
      new Bun.S3Client({
        accessKeyId,
        secretAccessKey,
        bucket,
        endpoint,
        region,
      });
    this.bucket = bucket;
  }

  /**
   * Upload a stream as a multipart object, returning the byte count written.
   *
   * The whole object never sits in memory, which is the difference between
   * staging a session recording and OOM-ing the container on one. Also lifts
   * the ceiling from S3's 5 GB single-PUT limit to
   * `MAX_STREAMED_OBJECT_BYTES`.
   */
  async putObjectStream(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType?: string,
  ): Promise<number> {
    const presigned = this.client.presign(key, {
      method: "PUT",
      expiresIn: MULTIPART_URL_LIFETIME_SECONDS,
    });
    const call = async (
      method: string,
      query: Record<string, string>,
      init: {
        body?: ArrayBuffer | string;
        headers?: Record<string, string>;
      } = {},
    ) => {
      const response = await this.send(
        signPresigned(presigned, method, query, this.secretAccessKey),
        { method, ...init },
      );
      if (!response.ok)
        throw new InternalServerError(
          `Bun S3 putObjectStream ${method} for ${key} answered ${response.status}`,
        );
      return response;
    };

    const created = await (
      await call(
        "POST",
        { uploads: "" },
        contentType ? { headers: { "content-type": contentType } } : {},
      )
    ).text();
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(created)?.[1];
    if (!uploadId)
      throw new InternalServerError(
        `Bun S3 putObjectStream got no upload id for ${key}`,
      );

    const etags: string[] = [];
    const uploadPart = async (bytes: ArrayBuffer) => {
      const response = await call(
        "PUT",
        {
          partNumber: String(etags.length + 1),
          uploadId,
        },
        { body: bytes },
      );
      etags.push(response.headers.get("etag") ?? "");
    };

    const reader = body.getReader();
    const buffer = new ArrayBuffer(this.partSize);
    const part = new Uint8Array(buffer);
    let filled = 0;
    let written = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (written + value.byteLength > MAX_STREAMED_OBJECT_BYTES)
          throw new InternalServerError(
            `Bun S3 putObjectStream refused ${key}: exceeds ${MAX_STREAMED_OBJECT_BYTES} bytes`,
          );
        written += value.byteLength;
        let at = 0;
        while (at < value.byteLength) {
          const take = Math.min(this.partSize - filled, value.byteLength - at);
          part.set(value.subarray(at, at + take), filled);
          filled += take;
          at += take;
          if (filled === this.partSize) {
            await uploadPart(buffer.slice(0));
            filled = 0;
          }
        }
      }
      if (filled > 0 || etags.length === 0)
        await uploadPart(buffer.slice(0, filled));
      const parts = etags
        .map(
          (etag, i) =>
            `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`,
        )
        .join("");
      await call(
        "POST",
        { uploadId },
        {
          body: `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`,
          headers: { "content-type": "application/xml" },
        },
      );
      return written;
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      await call("DELETE", { uploadId }).catch(() => undefined);
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError(
        `Bun S3 putObjectStream failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** The object as a stream. Null when the key does not exist. */
  async getObjectStream(
    key: string,
  ): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const file = this.client.file(key);
      if (!(await file.exists())) return null;
      return file.stream();
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 getObjectStream failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * A byte range, INCLUSIVE at both ends, the semantics of an HTTP `Range`
   * header, so a caller serving one does not have to convert. `end` omitted
   * runs to the end of the object. Null when the key does not exist.
   */
  async getObjectRange(
    key: string,
    start: number,
    end?: number,
  ): Promise<Uint8Array | null> {
    try {
      const file = this.client.file(key);
      if (!(await file.exists())) return null;
      // Bun's slice is half-open like Array.slice; HTTP Range is inclusive.
      const part = file.slice(start, end === undefined ? undefined : end + 1);
      return new Uint8Array(await part.arrayBuffer());
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 getObjectRange failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Upload bytes to a key. */
  async putObject(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string,
  ): Promise<void> {
    try {
      const file = this.client.file(key);
      await file.write(body, contentType ? { type: contentType } : undefined);
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 putObject failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Download bytes from a key. Returns null if the object does not exist. */
  async getObjectBytes(key: string): Promise<Uint8Array | null> {
    try {
      const file = this.client.file(key);
      if (!(await file.exists())) return null;
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 getObject failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Download a key as text (UTF-8). Returns null if the object does not exist. */
  async getObjectText(key: string): Promise<string | null> {
    try {
      const file = this.client.file(key);
      if (!(await file.exists())) return null;
      return await file.text();
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 getObjectText failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Delete an object. No-op if it doesn't exist. */
  async deleteObject(key: string): Promise<void> {
    try {
      const file = this.client.file(key);
      await file.delete();
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 deleteObject failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Check if an object exists. */
  async exists(key: string): Promise<boolean> {
    return this.client.file(key).exists();
  }

  async size(key: string): Promise<number | null> {
    if (!(await this.client.file(key).exists())) return null;
    return (await this.client.file(key).stat()).size;
  }

  /**
   * Generate a presigned URL for an object.
   * @param key, S3 key
   * @param expiresInSeconds, URL TTL (per `storage.constants.ts`: 3h public, 3d private)
   * @param method, HTTP method the URL grants. Default GET.
   */
  presignUrl(
    key: string,
    expiresInSeconds: number,
    method: "GET" | "PUT" | "DELETE" = "GET",
  ): string {
    return this.client.presign(key, {
      method,
      expiresIn: expiresInSeconds,
    });
  }

  async listObjects(
    prefix: string,
  ): Promise<Array<{ key: string; lastModified: Date | null }>> {
    const found: Array<{ key: string; lastModified: Date | null }> = [];
    let startAfter: string | undefined;
    for (;;) {
      const page = await this.client.list({ prefix, startAfter });
      const contents = page.contents ?? [];
      for (const o of contents)
        found.push({
          key: o.key,
          lastModified: o.lastModified ? new Date(o.lastModified) : null,
        });
      if (!page.isTruncated || contents.length === 0) return found;
      startAfter = contents[contents.length - 1].key;
    }
  }

  presignPutOfLength(
    key: string,
    expiresInSeconds: number,
    contentLength: number,
    contentType?: string,
  ): string {
    return signContentLength(
      this.presignUrl(key, expiresInSeconds, "PUT"),
      contentLength,
      this.secretAccessKey,
      contentType,
    );
  }
}

const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const hmac = (key: string | Uint8Array, data: string) =>
  new Uint8Array(createHmac("sha256", key).update(data).digest());

export function signContentLength(
  presignedPut: string,
  contentLength: number,
  secretAccessKey: string,
  contentType?: string,
): string {
  return signPresigned(presignedPut, "PUT", {}, secretAccessKey, {
    "content-length": String(contentLength),
    ...(contentType === undefined ? {} : { "content-type": contentType }),
  });
}

export function signPresigned(
  presigned: string,
  method: string,
  extraQuery: Record<string, string>,
  secretAccessKey: string,
  signedHeaders: Record<string, string> = {},
): string {
  const url = new URL(presigned);
  const headers = { ...signedHeaders, host: url.host };
  const headerNames = Object.keys(headers).sort();
  const names = headerNames.join(";");
  const query = [
    ...[...url.searchParams].filter(([name]) => name !== "X-Amz-Signature"),
    ...Object.entries(extraQuery),
  ]
    .map(([name, value]) =>
      name === "X-Amz-SignedHeaders"
        ? `${name}=${encode(names)}`
        : `${encode(name)}=${encode(value)}`,
    )
    .sort()
    .join("&");
  const [, day, region, service] = (
    url.searchParams.get("X-Amz-Credential") ?? ""
  ).split("/");
  const canonical = [
    method,
    url.pathname,
    query,
    headerNames
      .map((name) => `${name}:${headers[name as keyof typeof headers]}\n`)
      .join(""),
    names,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = [
    "AWS4-HMAC-SHA256",
    url.searchParams.get("X-Amz-Date") ?? "",
    `${day}/${region}/${service}/aws4_request`,
    createHash("sha256").update(canonical).digest("hex"),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(toSign)
    .digest("hex");
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signature}`;
}
