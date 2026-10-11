import crypto from "node:crypto";
import type { Context } from "elysia";

function digest(value: string) {
  return new Uint8Array(crypto.createHash("sha256").update(value).digest());
}

function matchesKey(given: string | null, expected: string): boolean {
  return crypto.timingSafeEqual(digest(given ?? ""), digest(expected));
}

export function adminApiKeyGuard({
  request,
  set,
}: {
  request: Request;
  set: Context["set"];
}) {
  const key = request.headers.get("x-api-key");
  const expected = process.env.ADMIN_API_KEY;

  if (!expected || !matchesKey(key, expected)) {
    set.status = 401;
    return { error: "UNAUTHORIZED", message: "Valid X-Api-Key required" };
  }
}
