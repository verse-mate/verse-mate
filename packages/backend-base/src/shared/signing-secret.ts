const PUBLISHED_SECRETS = ["my-super-secret", "CHANGE_ME_TO_A_UNIQUE_SECRET"];
const PRODUCTION_MINIMUM_LENGTH = 32;

export function signingSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.AUTH_ACCESS_TOKEN_SECRET;
  if (!secret || secret === "my-super-secret") {
    throw new Error(
      "AUTH_ACCESS_TOKEN_SECRET is unset or the known-public default; refusing to start; set a unique secret",
    );
  }
  if (env.ENVIRONMENT !== "production") return secret;
  if (PUBLISHED_SECRETS.includes(secret.trim())) {
    throw new Error(
      "AUTH_ACCESS_TOKEN_SECRET is a value published in the repository's example settings; refusing to start in production; set a unique secret",
    );
  }
  if (secret.length < PRODUCTION_MINIMUM_LENGTH) {
    throw new Error(
      `AUTH_ACCESS_TOKEN_SECRET is shorter than ${PRODUCTION_MINIMUM_LENGTH} characters; refusing to start in production; set a longer unique secret`,
    );
  }
  return secret;
}
