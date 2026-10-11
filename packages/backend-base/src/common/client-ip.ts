import { isIP } from "node:net";

interface AddressSource {
  requestIP(request: Request): { address: string } | null;
}

let reportedHops = "";
let smallestLogged = Number.POSITIVE_INFINITY;
let smallestShort = Number.POSITIVE_INFINITY;

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
}

function logForwardedCount(count: number): void {
  if (count === 0 || count >= smallestLogged) return;
  smallestLogged = count;
  console.log(
    `[CLIENT-IP] TRUSTED_PROXY_HOPS is not set; a request carried ${count} forwarded address(es), the fewest so far; set it to the fewest logged`,
  );
}

function logShortChain(count: number, hops: number): void {
  if (count === 0 || count >= hops || count >= smallestShort) return;
  smallestShort = count;
  console.error(
    `[CLIENT-IP] TRUSTED_PROXY_HOPS is ${hops} but a request carried ${count} forwarded address(es); the value is too high or the request skipped a proxy`,
  );
}

function address(entry: string | null | undefined): string | undefined {
  const value = (entry ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\](:\d+)?$/, "$1")
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1")
    .replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
  return isIP(value) ? value : undefined;
}

export function clientIp(
  request: Request,
  server?: AddressSource | null,
): string {
  const socket = address(server?.requestIP(request)?.address) ?? "unknown";
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

function prefix64(ip: string): string {
  const [head, tail] = ip.split("::");
  const groups = (part = "") =>
    part
      .split(":")
      .filter(Boolean)
      .flatMap((g) => (g.includes(".") ? ["0", "0"] : [g]));
  const front = groups(head);
  const back = groups(tail);
  const full =
    tail === undefined
      ? front
      : [...front, ...Array(8 - front.length - back.length).fill("0"), ...back];
  return `${full
    .slice(0, 4)
    .map((g) => Number.parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

export function clientBucket(
  request: Request,
  server?: AddressSource | null,
): string {
  const ip = clientIp(request, server);
  return trustedProxyHops() !== null && isIP(ip) === 6 ? prefix64(ip) : ip;
}
