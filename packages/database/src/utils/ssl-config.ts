export const getSSLConfig = () => {
  const url = process.env.POSTGRES_URL || "";
  if (!url.includes("sslmode=require")) return false;
  const ca = process.env.POSTGRES_CA_CERT;
  return ca
    ? { rejectUnauthorized: true as const, ca }
    : { rejectUnauthorized: true as const };
};

/**
 * Get a clean connection string with sslmode removed.
 * The sslmode in URL conflicts with the ssl config object.
 */
export const getCleanConnectionString = () => {
  const url = process.env.POSTGRES_URL || "";
  return url.replace(/[?&]sslmode=require/g, "").replace(/\?$/, "");
};
