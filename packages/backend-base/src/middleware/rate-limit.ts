import type { Context } from "elysia";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

const windows = new Map<string, { count: number; resetAt: number }>();

export function ipRateLimit({
  request,
  set,
}: {
  request: Request;
  set: Context["set"];
}) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const now = Date.now();
  const entry = windows.get(ip);

  if (!entry || now >= entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    set.status = 429;
    return { error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" };
  }
}
