interface AddressSource {
  requestIP(request: Request): { address: string } | null;
}

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

let reportedHops = "";

function trustedProxyHops(): number {
  const raw = (process.env.TRUSTED_PROXY_HOPS ?? "").trim();
  if (raw === "") return DEFAULT_TRUSTED_PROXY_HOPS;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw !== reportedHops) {
    reportedHops = raw;
    console.error(
      `[CLIENT-IP] Unknown TRUSTED_PROXY_HOPS "${raw}"; using ${DEFAULT_TRUSTED_PROXY_HOPS}`,
    );
  }
  return DEFAULT_TRUSTED_PROXY_HOPS;
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
