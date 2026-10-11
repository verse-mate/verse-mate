import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server, createServer } from "node:tls";
import { createBullmqRedisConnection } from "./bullmq-redis";
import { RedisClient } from "./redis-client";
import { verifyRedisOrExit } from "./redis-startup-check";

type Handshake = "trusted" | "refused";

function openssl(cwd: string, args: string[]) {
  const result = Bun.spawnSync(["openssl", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function testCertificates() {
  const dir = mkdtempSync(join(tmpdir(), "redis-tls-"));
  try {
    openssl(dir, [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
      "-days",
      "1",
      "-subj",
      "/CN=Redis test CA",
    ]);
    openssl(dir, [
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "server.key",
      "-out",
      "server.csr",
      "-subj",
      "/CN=localhost",
    ]);
    writeFileSync(join(dir, "san.ext"), "subjectAltName=DNS:localhost\n");
    openssl(dir, [
      "x509",
      "-req",
      "-in",
      "server.csr",
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "server.crt",
      "-days",
      "1",
      "-extfile",
      "san.ext",
    ]);
    const read = (name: string) => readFileSync(join(dir, name), "utf8");
    return {
      ca: read("ca.crt"),
      key: read("server.key"),
      cert: read("server.crt"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Redis TLS handshake", () => {
  const ORIGINAL_CA = process.env.REDIS_CA_CERT;
  const certificates = testCertificates();
  let server: Server;
  let url: string;
  let waiting: ((outcome: Handshake) => void) | undefined;

  beforeAll(async () => {
    server = createServer(
      { key: certificates.key, cert: certificates.cert },
      (socket) => {
        waiting?.("trusted");
        socket.destroy();
      },
    );
    server.on("tlsClientError", () => waiting?.("refused"));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `rediss://localhost:${(server.address() as AddressInfo).port}/0`;
  });

  afterEach(() => {
    if (ORIGINAL_CA === undefined)
      Reflect.deleteProperty(process.env, "REDIS_CA_CERT");
    else process.env.REDIS_CA_CERT = ORIGINAL_CA;
  });

  afterAll(() => {
    server.close();
  });

  function nextHandshake() {
    return new Promise<Handshake>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no handshake")), 5000);
      waiting = (outcome) => {
        clearTimeout(timer);
        waiting = undefined;
        resolve(outcome);
      };
    });
  }

  async function cacheClientHandshake() {
    const client = new RedisClient(url);
    const outcome = nextHandshake();
    client.connect().catch(() => undefined);
    try {
      return await outcome;
    } finally {
      await client.disconnect();
    }
  }

  async function queueConnectionHandshake() {
    const connection = createBullmqRedisConnection(url);
    connection.on("error", () => undefined);
    const outcome = nextHandshake();
    connection.connect().catch(() => undefined);
    try {
      return await outcome;
    } finally {
      connection.disconnect();
    }
  }

  for (const [name, handshake] of [
    ["cache client", cacheClientHandshake],
    ["queue connection", queueConnectionHandshake],
  ] as const) {
    it(`${name} refuses a server certificate it cannot verify`, async () => {
      Reflect.deleteProperty(process.env, "REDIS_CA_CERT");

      expect(await handshake()).toBe("refused");
    });

    it(`${name} trusts a server certificate signed by REDIS_CA_CERT`, async () => {
      process.env.REDIS_CA_CERT = certificates.ca;

      expect(await handshake()).toBe("trusted");
    });
  }

  it("stops the backend at startup when the server certificate cannot be verified", async () => {
    Reflect.deleteProperty(process.env, "REDIS_CA_CERT");
    const cache = new RedisClient(url);
    const queue = createBullmqRedisConnection(url);
    queue.on("error", () => undefined);
    const exits: number[] = [];

    try {
      await verifyRedisOrExit({
        cache,
        queue,
        redisUrl: url,
        timeoutMs: 2000,
        exit: (code) => exits.push(code),
      });
    } finally {
      await cache.disconnect();
      queue.disconnect();
    }

    expect(exits).toEqual([1]);
  });
});
