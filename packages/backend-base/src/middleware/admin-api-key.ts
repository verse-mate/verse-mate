import type { Context } from "elysia";

export function adminApiKeyGuard({
  request,
  set,
}: {
  request: Request;
  set: Context["set"];
}) {
  const key = request.headers.get("x-api-key");
  const expected = process.env.ADMIN_API_KEY;

  if (!expected || key !== expected) {
    set.status = 401;
    return { error: "UNAUTHORIZED", message: "Valid X-Api-Key required" };
  }
}
