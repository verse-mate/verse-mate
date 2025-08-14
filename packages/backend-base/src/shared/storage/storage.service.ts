import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import storageConstants from "./storage.constants";

const ACL_PUBLIC_READ = "public-read";
const POLICY_VERSION = "2012-10-17";

class S3Helper {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(
    endpoint: string,
    region: string,
    bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      forcePathStyle: false,
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.bucket = bucket;
  }

  async sendPutObjectCommand(command: PutObjectCommand): Promise<void> {
    try {
      await this.client.send(command);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Operation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async sendPutBucketPolicyCommand(
    command: PutBucketPolicyCommand,
  ): Promise<void> {
    try {
      await this.client.send(command);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bucket policy update failed: ${error.message}`);
      }
      throw error;
    }
  }

  async bucketExists(bucketName: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucketName }));
      return true;
    } catch {
      return false;
    }
  }

  async createBucket(bucketName: string): Promise<void> {
    if (await this.bucketExists(bucketName)) {
      return;
    }

    await this.client.send(
      new CreateBucketCommand({ Bucket: bucketName, ACL: ACL_PUBLIC_READ }),
    );
  }

  async deleteFile(bucket: string, fileName: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileName,
        }),
      );
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  public async createPresignedPost({
    bucket,
    userId,
    folder,
    fileName,
  }: {
    bucket: string;
    userId: string;
    folder: string;
    fileName: string;
  }): Promise<string> {
    // @ts-ignore
    const filename = fileName.replaceAll(/\s/gu, "_");
    const mainFolder = storageConstants.mainFolder;

    const folderToUpload = `${mainFolder}/${userId}/${folder}`;
    await this.createFolder(bucket, folderToUpload);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: `${folderToUpload}/${filename}`,
    });

    await this.sendPutObjectCommand(command);

    return getSignedUrl(this.client, command, {
      expiresIn: storageConstants.privateObjectStorageUrlExpiresInSeconds(),
    }).catch((error) => {
      throw new Error(`Operation failed: ${error.message}`);
    });
  }

  async createPresignedGet({
    bucketName,
    fileName,
    isPublic,
  }: {
    bucketName: string;
    fileName: string;
    isPublic: boolean;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: isPublic
        ? storageConstants.publicObjectStorageUrlExpiresInSeconds()
        : storageConstants.privateObjectStorageUrlExpiresInSeconds(),
    }).catch((error) => {
      throw new Error(`Operation failed: ${error.message}`);
    });
  }

  async createFolder(bucket: string, folderName: string): Promise<boolean> {
    try {
      const output = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: folderName,
        }),
      );

      if (output.KeyCount === 0) {
        const putCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: `${folderName}/`,
        });

        await this.client.send(putCommand);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export class ObjectStorageService {
  private readonly s3Helper: S3Helper;

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

    this.s3Helper = new S3Helper(
      endpoint ?? "",
      region ?? "",
      bucket ?? "",
      accessKeyId ?? "",
      secretAccessKey ?? "",
    );
  }

  public async makeBucket(bucketName: string): Promise<void> {
    return this.s3Helper.createBucket(bucketName).catch((error) => {
      throw new Error(`Operation failed: ${error.message}`);
    });
  }

  public async setBucketPolicy(bucketName: string): Promise<void> {
    const policy = {
      Version: POLICY_VERSION,
      Statement: [
        {
          Sid: "AddPerm",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };

    const command = new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(policy),
    });

    return this.s3Helper.sendPutBucketPolicyCommand(command);
  }

  public async getLinkToUploadImage({
    folder,
    imageExtension,
    userId,
  }: {
    folder: string;
    imageExtension: string;
    userId: string;
  }): Promise<string> {
    const fileName = `${Date.now().toString()}.${imageExtension}`;

    return await this.s3Helper.createPresignedPost({
      bucket: this.s3Helper.bucket,
      userId,
      folder,
      fileName,
    });
  }

  public async getImage({
    userId,
    isPublic,
    folder,
    file,
  }: {
    userId: string;
    isPublic: boolean;
    folder: string;
    file: string | null | undefined;
  }): Promise<string | null> {
    return file
      ? await this.s3Helper.createPresignedGet({
          bucketName: this.s3Helper.bucket,
          fileName: `${storageConstants.mainFolder}/${userId}/${folder}/${file}`,
          isPublic,
        })
      : null;
  }

  public async deleteFile(bucket: string, fileName: string): Promise<boolean> {
    return this.s3Helper.deleteFile(bucket, fileName);
  }
}
