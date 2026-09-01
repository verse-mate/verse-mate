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
      /** Multipart upload sink. */
      writer(opts?: {
        type?: string;
        partSize?: number;
        queueSize?: number;
      }): {
        write(chunk: Uint8Array): number | Promise<number>;
        end(): Promise<void> | void;
      };
    };
    presign(
      key: string,
      opts: { method?: "GET" | "PUT" | "DELETE"; expiresIn: number },
    ): string;
  };
};
type BunS3Client = ReturnType<
  typeof Bun.S3Client extends new (...args: any[]) => infer R ? () => R : never
>;

/**
 * Multipart part size. S3 allows at most 10,000 parts per object, so this
 * number times 10,000 IS the supported object ceiling — task 4.3b asks for that
 * ceiling to be stated rather than discovered by a failed upload.
 */
export const MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024;

/** S3's hard limit on parts in one multipart upload. */
const S3_MAX_PARTS = 10_000;

/**
 * The largest object this helper can store: ~160 GB.
 *
 * Worth stating because the surface it replaces could not say this. A single
 * PUT — the only thing `putObject` ever did — caps at S3's 5 GB single-object
 * limit, which a long recorded session can exceed, and the failure arrives at
 * upload time with no warning beforehand.
 */
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
 * not modeled here — buckets are pre-provisioned at the infrastructure layer.
 */
export class BunS3Helper {
  private readonly client: BunS3Client;
  readonly bucket: string;

  constructor(
    endpoint: string,
    region: string,
    bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
    /**
     * An injected client. Only the streaming tests pass one: the multipart and
     * range paths are the parts most worth covering and the ones a live bucket
     * makes slowest to exercise.
     */
    client?: BunS3Client,
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
   * The whole object never sits in memory — which is the difference between
   * staging a session recording and OOM-ing the container on one. Also lifts
   * the ceiling from S3's 5 GB single-PUT limit to
   * `MAX_STREAMED_OBJECT_BYTES`.
   */
  async putObjectStream(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType?: string,
  ): Promise<number> {
    try {
      const file = this.client.file(key);
      const writer = file.writer({
        type: contentType,
        partSize: MULTIPART_PART_SIZE_BYTES,
      });
      const reader = body.getReader();
      let written = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        await writer.write(value);
        written += value.byteLength;
      }
      await writer.end();
      return written;
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerError(
          `Bun S3 putObjectStream failed: ${error.message}`,
        );
      }
      throw error;
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
   * A byte range, INCLUSIVE at both ends — the semantics of an HTTP `Range`
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

  /**
   * Generate a presigned URL for an object.
   * @param key — S3 key
   * @param expiresInSeconds — URL TTL (per `storage.constants.ts`: 3h public, 3d private)
   * @param method — HTTP method the URL grants. Default GET.
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
}
