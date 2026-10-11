const PRODUCTION_MINIMUM_LENGTH = 32;

export function signingSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env.AUTH_ACCESS_TOKEN_SECRET;
  if (!secret || secret === "my-super-secret") {
    throw new Error(
      "AUTH_ACCESS_TOKEN_SECRET is unset or the known-public default; refusing to start; set a unique secret",
    );
  }
  if (
    env.ENVIRONMENT === "production" &&
    secret.trim().length < PRODUCTION_MINIMUM_LENGTH
  ) {
    throw new Error(
      `AUTH_ACCESS_TOKEN_SECRET must be a unique secret of at least ${PRODUCTION_MINIMUM_LENGTH} characters in production, never a published example value; refusing to start`,
    );
  }
  return secret;
}
