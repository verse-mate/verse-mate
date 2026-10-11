const VERIFIED_MODES = new Set(["require", "verify-ca", "verify-full"]);

function postgresUrl(): URL | null {
  const raw = process.env.POSTGRES_URL || "";
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    throw new Error(
      "POSTGRES_URL is not a valid URL: percent-encode reserved characters in the user name and password",
    );
  }
}

export const getSSLConfig = () => {
  const modes = postgresUrl()?.searchParams.getAll("sslmode") ?? [];
  const unsupported = modes.find(
    (mode) => mode !== "disable" && !VERIFIED_MODES.has(mode),
  );
  if (unsupported !== undefined) {
    throw new Error(
      `Unsupported sslmode "${unsupported}" in POSTGRES_URL: use require, verify-ca, verify-full or disable`,
    );
  }
  if (!modes.some((mode) => VERIFIED_MODES.has(mode))) return false;
  const ca = process.env.POSTGRES_CA_CERT?.replace(/\\n/g, "\n");
  return ca
    ? { rejectUnauthorized: true as const, ca }
    : { rejectUnauthorized: true as const };
};

export const getCleanConnectionString = () => {
  const raw = process.env.POSTGRES_URL || "";
  const url = postgresUrl();
  if (!url || !url.searchParams.has("sslmode")) return raw;
  url.searchParams.delete("sslmode");
  return url.toString();
};
