import { describe, expect, it } from "bun:test";

/**
 * Task 5.3. Frame extraction for the Visual Aids dimension needs ffmpeg in the
 * image, and the image had curl, postgresql-client and vim. A missing binary
 * would surface as every Visual Aids score failing in production, on a
 * dimension that is legitimately not-applicable often enough for the failure to
 * look like normal behaviour.
 */
describe("the runtime carries what media scoring needs", () => {
  it("the backend image installs ffmpeg", async () => {
    const dockerfile = await Bun.file(
      new URL("../../../../apps/backend/Dockerfile", import.meta.url).pathname,
    ).text();
    const install = dockerfile
      .split("\n")
      .find((l) => l.startsWith("RUN apt-get update"));
    expect(install).toBeTruthy();
    expect(install).toContain("ffmpeg");
  });

  it("the image still installs what it installed before", async () => {
    // Adding a package must not quietly drop one; the API needs curl for its
    // own HEALTHCHECK.
    const dockerfile = await Bun.file(
      new URL("../../../../apps/backend/Dockerfile", import.meta.url).pathname,
    ).text();
    const install = dockerfile
      .split("\n")
      .find((l) => l.startsWith("RUN apt-get update")) as string;
    for (const pkg of ["curl", "postgresql-client", "vim"]) {
      expect(install).toContain(pkg);
    }
    expect(dockerfile).toContain("HEALTHCHECK CMD curl");
  });
});
