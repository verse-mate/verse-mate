export function redisTlsOptions(url: string) {
  if (!url.startsWith("rediss://")) return undefined;
  const ca = process.env.REDIS_CA_CERT?.replace(/\\n/g, "\n");
  return ca
    ? { rejectUnauthorized: true as const, ca }
    : { rejectUnauthorized: true as const };
}
