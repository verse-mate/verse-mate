export function redisTlsOptions(url: string) {
  if (!url.startsWith("rediss://")) return undefined;
  const ca = process.env.REDIS_CA_CERT;
  return ca
    ? { rejectUnauthorized: true as const, ca }
    : { rejectUnauthorized: true as const };
}
