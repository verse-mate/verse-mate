interface AddressSource {
  requestIP(request: Request): { address: string } | null;
}

let reportedHops = "";
let smallestLogged = Number.POSITIVE_INFINITY;

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

export function forgetLoggedForwardedCounts(): void {
  smallestLogged = Number.POSITIVE_INFINITY;
}

function logForwardedCount(count: number): void {
  if (count === 0 || count >= smallestLogged) return;
  smallestLogged = count;
  console.log(
    `[CLIENT-IP] TRUSTED_PROXY_HOPS is not set; a request carried ${count} forwarded address(es), the fewest so far; set it to the fewest logged`,
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
