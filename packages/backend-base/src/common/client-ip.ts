interface AddressSource {
  requestIP(request: Request): { address: string } | null;
}

let reportedHops = "";
const loggedCounts = new Set<number>();
const MAX_LOGGED_COUNTS = 10;

export function trustedProxyHops(): number | null {
  const raw = (process.env.TRUSTED_PROXY_HOPS ?? "").trim();
  if (raw === "") return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw !== reportedHops) {
    reportedHops = raw;
    console.error(
      `[CLIENT-IP] Unknown TRUSTED_PROXY_HOPS "${raw}"; read as not set`,
    );
  }
  return null;
}

function logForwardedCount(count: number): void {
  if (loggedCounts.has(count) || loggedCounts.size >= MAX_LOGGED_COUNTS) return;
  loggedCounts.add(count);
  console.log(
    `[CLIENT-IP] TRUSTED_PROXY_HOPS is not set; a request carried ${count} forwarded address(es)`,
  );
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
  const hops = trustedProxyHops();
  if (hops === null) {
    logForwardedCount(forwarded.length);
    return forwarded[0] ?? socket;
  }
  const chain = [...forwarded, socket];
  return chain[Math.max(0, chain.length - 1 - hops)];
}
