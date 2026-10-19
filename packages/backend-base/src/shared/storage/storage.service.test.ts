import { describe, expect, it } from "bun:test";
import { ObjectStorageService } from "./storage.service";

describe("ObjectStorageService upload addresses", () => {
  const storage = new ObjectStorageService();

  it("signs the content type it is given into an address of fixed length", async () => {
    const url = new URL(
      await storage.getGlobalObjectUploadUrl({
        key: "coach/learning/videos/1",
        expiresInSeconds: 60,
        contentLength: 5,
        contentType: "video/mp4",
      }),
    );
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host",
    );
  });
});
