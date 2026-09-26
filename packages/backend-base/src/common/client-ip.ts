interface AddressSource {
  requestIP(request: Request): { address: string } | null;
}

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

function trustedProxyHops(): number {
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  return Number.isInteger(hops) && hops >= 0
    ? hops
    : DEFAULT_TRUSTED_PROXY_HOPS;
}

export function clientIp(
  request: Request,
  server?: AddressSource | null,
): string {
  const socket = server?.requestIP(request)?.address ?? "unknown";
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [...forwarded, socket];
  return chain[Math.max(0, chain.length - 1 - trustedProxyHops())];
}
