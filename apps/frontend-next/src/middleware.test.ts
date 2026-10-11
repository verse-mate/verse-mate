import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function visit(path: string) {
  return middleware(new NextRequest(`https://admin.example.test${path}`));
}

describe("admin middleware", () => {
  it("serves the sign-in callback pages with no Referer for anything they load", async () => {
    for (const path of [
      "/auth/callback/google?code=one-time-code",
      "/auth/callback/apple?code=one-time-code",
    ]) {
      const response = await visit(path);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("leaves the referrer policy of the login page alone", async () => {
    const response = await visit("/login");

    expect(response.headers.get("referrer-policy")).toBeNull();
  });
});
