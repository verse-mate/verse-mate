import { BunS3Helper } from "./bun-s3.helper";
import storageConstants from "./storage.constants";

/**
 * Object storage service backed by Bun's built-in S3 client.
 *
 * Per spec feat-integrations br-int-003 (Phase 1 decision D-002): the legacy
 * @aws-sdk/client-s3 implementation has been replaced by `BunS3Helper`. The
 * surface exposed here is the actual surface in use across the codebase
 * (audio.service, audio-cleanup.service, offline.service): putGlobalObject,
 * getGlobalObjectUrl, deleteObject. Bucket-level provisioning is handled by
 * infrastructure (MinIO local, DigitalOcean Spaces production).
 */
export class ObjectStorageService {
  private readonly helper: BunS3Helper;

  constructor() {
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const region = process.env.OBJECT_STORAGE_REGION;
    const bucket = process.env.OBJECT_STORAGE_BUCKET;
    const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;

    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      console.error(
        `Missing ${ObjectStorageService.name} environment variables`,
      );
    }

    this.helper = new BunS3Helper(
      endpoint ?? "",
      region ?? "",
      bucket ?? "",
      accessKeyId ?? "",
      secretAccessKey ?? "",
    );
  }

  /**
   * Upload an object at an arbitrary key.
   * Used for non-user-scoped assets such as generated audio.
   */
  public async putGlobalObject({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.helper.putObject(key, body, contentType);
  }

  /**
   * Return a presigned GET URL for an arbitrary key.
   */
  public async getGlobalObjectUrl({
    key,
    expiresInSeconds,
  }: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const ttl =
      expiresInSeconds ??
      storageConstants.publicObjectStorageUrlExpiresInSeconds();
    return this.helper.presignUrl(key, ttl, "GET");
  }

  /**
   * Delete an object by key from the default bucket. Returns false if the
   * underlying call throws (callers retry the DB row on the next sweep).
   */
  public async deleteObject(key: string): Promise<boolean> {
    try {
      await this.helper.deleteObject(key);
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }
}
