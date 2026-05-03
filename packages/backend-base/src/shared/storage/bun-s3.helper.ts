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
 * Bun-native S3 helper.
 *
 * Per spec feat-integrations br-int-003 (Phase 1 decision D-002): replace
 * @aws-sdk/client-s3 with Bun's built-in S3 client. Smaller dependency surface,
 * faster cold starts, identical S3-compatible behavior against MinIO local +
 * DigitalOcean Spaces production.
 *
 * This file is the migration scaffolding. It mirrors the public surface of
 * S3Helper (legacy) so callers can switch import sites incrementally.
 *
 * Migration status: scaffolding ready, unit tests cover put/get/delete/exists.
 * Bucket-level operations (createBucket, putBucketPolicy) deferred since
 * MinIO/Spaces buckets are pre-provisioned at infrastructure level.
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
  ) {
    this.client = new Bun.S3Client({
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint,
      region,
    });
    this.bucket = bucket;
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
