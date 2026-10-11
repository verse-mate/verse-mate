import { cors } from "@elysiajs/cors";

export function createCorsPlugin(
  _env: Record<string, string | undefined> = process.env,
) {
  return cors();
}

export default createCorsPlugin();
