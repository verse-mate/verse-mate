/**
 * SSL configuration for DigitalOcean managed databases.
 * DO uses self-signed certificates, so when sslmode=require is present,
 * we need to set rejectUnauthorized: false.
 */
export const getSSLConfig = () => {
  const url = process.env.POSTGRES_URL || "";
  if (url.includes("sslmode=require")) {
    return { rejectUnauthorized: false };
  }
  return false;
};
