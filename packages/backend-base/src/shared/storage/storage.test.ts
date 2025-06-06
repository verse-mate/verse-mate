import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";

import { ObjectStorageService } from "./storage.service";

describe.skip("ObjectStorageService", () => {
  let storageService: ObjectStorageService;
  let bucketName: string;
  const createdFiles: string[] = [];

  beforeAll(() => {
    storageService = new ObjectStorageService();
    bucketName = faker.internet.domainWord();
  });

  afterAll(async () => {
    for (const fileName of createdFiles) {
      await storageService.deleteFile("saas-starter-dev", fileName);
    }
  });

  it("should create a bucket", async () => {
    await storageService.makeBucket(bucketName);

    expect(true).toBe(true);
  });

  it("should create a link to upload an image", async () => {
    const userId = faker.string.uuid();
    const folder = "testFolder";
    const imageExtension = "jpg";
    const link = await storageService.getLinkToUploadImage({
      folder,
      imageExtension,
      userId,
    });
    expect(link).toBeDefined();
    expect(link).toContain("https://");
    expect(link).toContain(userId);
    expect(link).toContain(folder);
    expect(link).toContain(imageExtension);
    createdFiles.push(link.split("/").pop() as string);
  });

  it("should return null if file is not provided", async () => {
    const userId = faker.string.uuid();
    const folder = "testFolder";
    const isPublic = false;
    const link = await storageService.getImage({
      userId,
      folder,
      file: null,
      isPublic,
    });
    expect(link).toBeNull();
  });

  it("should return get Image link", async () => {
    const userId = faker.string.uuid();
    const folder = "testFolder";
    const isPublic = false;
    const file = "example.txt";
    const link = await storageService.getImage({
      userId,
      folder,
      file,
      isPublic,
    });
    expect(link).toBeDefined();
    expect(link).toContain("https://");
    expect(link).toContain(userId);
    expect(link).toContain(folder);
    expect(link).toContain(file);
    createdFiles.push(link?.split("/").pop() as string);
  });

  it("should delete a file", async () => {
    const fileName = "example.txt";
    const result = await storageService.deleteFile(bucketName, fileName);
    expect(result).toBe(true);
  });
});
