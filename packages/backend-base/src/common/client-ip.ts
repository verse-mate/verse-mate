import { isIP } from "node:net";

interface AddressSource {
  requestIP(request: Request): { address: string } | null;
}

let reportedHops = "";
let smallestLogged = Number.POSITIVE_INFINITY;
let smallestShort = Number.POSITIVE_INFINITY;
let reportedEmptyChain = false;

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

export function forgetClientIpLogs(): void {
  reportedHops = "";
  smallestLogged = Number.POSITIVE_INFINITY;
  smallestShort = Number.POSITIVE_INFINITY;
  reportedEmptyChain = false;
}

function logForwardedCount(count: number): void {
  if (count === 0 || count >= smallestLogged) return;
  smallestLogged = count;
  console.log(
    `[CLIENT-IP] TRUSTED_PROXY_HOPS is not set; a request carried ${count} forwarded address(es), the fewest so far; set it to the fewest logged`,
  );
}

function logShortChain(count: number, hops: number): void {
  if (count >= hops) return;
  if (count === 0) {
    if (reportedEmptyChain) return;
    reportedEmptyChain = true;
    console.error(
      `[CLIENT-IP] TRUSTED_PROXY_HOPS is ${hops} but a request carried no forwarded address; a proxy that appends nothing puts every caller on its address, unless this was a health check that reached the app directly`,
    );
    return;
  }
  if (count >= smallestShort) return;
  smallestShort = count;
  console.error(
    `[CLIENT-IP] TRUSTED_PROXY_HOPS is ${hops} but a request carried ${count} forwarded address(es); the value is too high or the request skipped a proxy`,
  );
}

function canonicalIpv6(value: string): string | undefined {
  try {
    return new URL(`http://[${value}]`).hostname.slice(1, -1);
  } catch {
    return undefined;
  }
}

function address(entry: string | null | undefined): string | undefined {
  const value = (entry ?? "")
    .trim()
    .replace(/^\[(.*)\](:\d+)?$/, "$1")
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  if (value.length > 64) return undefined;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6 || value.includes("%")) return undefined;
  const canonical = canonicalIpv6(value);
  if (canonical === undefined) return undefined;
  const mapped = canonical.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!mapped) return canonical;
  const [high, low] = [mapped[1], mapped[2]].map((g) => Number.parseInt(g, 16));
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function forwardedEntries(request: Request): string[] {
  return (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function clientIp(
  request: Request,
  server?: AddressSource | null,
): string {
  const socket = address(server?.requestIP(request)?.address) ?? "unknown";
  const forwarded = forwardedEntries(request);
  const hops = trustedProxyHops();
  if (hops === null) {
    logForwardedCount(forwarded.length);
    return (
      address(forwarded[0]) ??
      address(request.headers.get("x-real-ip")) ??
      socket
    );
  }
  logShortChain(forwarded.length, hops);
  const chain = [...forwarded, socket];
  return address(chain[Math.max(0, chain.length - 1 - hops)]) ?? socket;
}

function prefix(ip: string, bits: 48 | 64): string {
  const [head, tail] = ip.split("::");
  const groups = (part = "") => part.split(":").filter(Boolean);
  const front = groups(head);
  const back = groups(tail);
  const full =
    tail === undefined
      ? front
      : [...front, ...Array(8 - front.length - back.length).fill("0"), ...back];
  return `${full
    .slice(0, bits / 16)
    .map((g) => Number.parseInt(g, 16).toString(16))
    .join(":")}::/${bits}`;
}

function network(
  request: Request,
  server: AddressSource | null | undefined,
  bits: 48 | 64,
): string {
  const ip = clientIp(request, server);
  return trustedProxyHops() !== null && isIP(ip) === 6 ? prefix(ip, bits) : ip;
}

export function clientBucket(
  request: Request,
  server?: AddressSource | null,
): string {
  return network(request, server, 64);
}

export function clientNetwork(
  request: Request,
  server?: AddressSource | null,
): string {
  return network(request, server, 48);
}

export function clientChain(
  request: Request,
  server?: AddressSource | null,
): string {
  const bucket = clientBucket(request, server);
  if (trustedProxyHops() !== null) return bucket;
  const chain = forwardedEntries(request).map(address).filter(Boolean);
  return chain.length > 0 ? chain.join(", ") : bucket;
}
