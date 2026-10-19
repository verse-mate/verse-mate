import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import type { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server, createServer } from "node:tls";
import { createBullmqRedisConnection } from "./bullmq-redis";
import { RedisClient } from "./redis-client";

type Handshake = "trusted" | "refused";

const CERTIFICATE_ERRORS = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_SIGNATURE_FAILURE",
]);

function isCertificateError(error: unknown) {
  return CERTIFICATE_ERRORS.has(
    String((error as { code?: unknown } | null)?.code),
  );
}

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
  const unrelatedCa = testCertificates().ca;
  let server: Server;
  let url: string;
  let settle: ((outcome: Handshake) => void) | undefined;

  beforeAll(async () => {
    server = createServer(
      { key: certificates.key, cert: certificates.cert },
      (socket) => {
        socket.on("error", () => undefined);
        socket.once("data", () => {
          settle?.("trusted");
          socket.destroy();
        });
      },
    );
    server.on("tlsClientError", () => undefined);
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
      const timer = setTimeout(
        () => reject(new Error("the client neither sent data nor refused")),
        3000,
      );
      settle = (outcome) => {
        clearTimeout(timer);
        settle = undefined;
        resolve(outcome);
      };
    });
  }

  function onClientError(error: unknown) {
    if (isCertificateError(error)) settle?.("refused");
  }

  async function cacheClientHandshake() {
    const cache = new RedisClient(url);
    const socketEvents: EventEmitter = Reflect.get(cache, "client");
    socketEvents.on("error", onClientError);
    const outcome = nextHandshake();
    cache.connect().catch(onClientError);
    try {
      return await outcome;
    } finally {
      await cache.disconnect();
    }
  }

  async function queueConnectionHandshake() {
    const connection = createBullmqRedisConnection(url);
    connection.on("error", onClientError);
    const outcome = nextHandshake();
    connection.connect().catch(onClientError);
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

    it(`${name} refuses a server certificate REDIS_CA_CERT did not sign`, async () => {
      process.env.REDIS_CA_CERT = unrelatedCa;

      expect(await handshake()).toBe("refused");
    });

    it(`${name} trusts a server certificate signed by REDIS_CA_CERT`, async () => {
      process.env.REDIS_CA_CERT = certificates.ca;

      expect(await handshake()).toBe("trusted");
    });
  }
});
