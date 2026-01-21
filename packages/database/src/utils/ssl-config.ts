/**
 * SSL configuration for DigitalOcean managed databases.
 * DO uses self-signed certificates, so when sslmode=require is present,
 * we need to set rejectUnauthorized: false.
 *
 * IMPORTANT: The sslmode parameter in the URL conflicts with the ssl object.
 * We must remove it from the URL and use only the ssl object.
 */
export const getSSLConfig = () => {
  const url = process.env.POSTGRES_URL || "";
  if (url.includes("sslmode=require")) {
    return { rejectUnauthorized: false };
  }
  return false;
};

/**
 * Get a clean connection string with sslmode removed.
 * The sslmode in URL conflicts with the ssl config object.
 */
export const getCleanConnectionString = () => {
  const url = process.env.POSTGRES_URL || "";
  return url.replace(/[?&]sslmode=require/g, "").replace(/\?$/, "");
};
