import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, type Server, connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Server as TlsServer,
  createServer as createTlsServer,
} from "node:tls";
import pg from "pg";
import { getCleanConnectionString, getSSLConfig } from "./ssl-config";

type Handshake = "trusted" | "refused";

const SSL_REQUEST_LENGTH = 8;

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
  const dir = mkdtempSync(join(tmpdir(), "postgres-tls-"));
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
      "/CN=Postgres test CA",
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

describe("Postgres TLS handshake", () => {
  const ORIGINAL_URL = process.env.POSTGRES_URL;
  const ORIGINAL_CA = process.env.POSTGRES_CA_CERT;
  const certificates = testCertificates();
  let tlsServer: TlsServer;
  let front: Server;
  let port: number;
  let settle: ((outcome: Handshake) => void) | undefined;

  beforeAll(async () => {
    tlsServer = createTlsServer(
      { key: certificates.key, cert: certificates.cert },
      (socket) => {
        socket.on("error", () => undefined);
        socket.once("data", () => {
          settle?.("trusted");
          socket.destroy();
        });
      },
    );
    tlsServer.on("tlsClientError", () => undefined);
    await new Promise<void>((resolve) =>
      tlsServer.listen(0, "127.0.0.1", resolve),
    );
    const tlsPort = (tlsServer.address() as AddressInfo).port;

    front = createServer((socket) => {
      socket.on("error", () => undefined);
      socket.once("data", (request) => {
        if (request.length !== SSL_REQUEST_LENGTH) return socket.destroy();
        socket.write("S");
        const upstream = connect(tlsPort, "127.0.0.1");
        upstream.on("error", () => socket.destroy());
        socket.on("close", () => upstream.destroy());
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
    });
    await new Promise<void>((resolve) => front.listen(0, "127.0.0.1", resolve));
    port = (front.address() as AddressInfo).port;
  });

  afterEach(() => {
    for (const [name, value] of [
      ["POSTGRES_URL", ORIGINAL_URL],
      ["POSTGRES_CA_CERT", ORIGINAL_CA],
    ] as const) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  });

  afterAll(() => {
    front.close();
    tlsServer.close();
  });

  async function handshake(): Promise<Handshake> {
    process.env.POSTGRES_URL = `postgresql://app:secret@localhost:${port}/app?sslmode=require`;
    const outcome = new Promise<Handshake>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("the client neither sent data nor refused")),
        5000,
      );
      settle = (result) => {
        clearTimeout(timer);
        settle = undefined;
        resolve(result);
      };
    });
    const onClientError = (error: unknown) => {
      if (isCertificateError(error)) settle?.("refused");
    };
    const client = new pg.Client({
      connectionString: getCleanConnectionString(),
      ssl: getSSLConfig(),
    });
    client.on("error", onClientError);
    client.connect().catch(onClientError);
    try {
      return await outcome;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  it("refuses a server certificate it cannot verify", async () => {
    Reflect.deleteProperty(process.env, "POSTGRES_CA_CERT");

    expect(await handshake()).toBe("refused");
  });

  it("trusts a server certificate signed by POSTGRES_CA_CERT", async () => {
    process.env.POSTGRES_CA_CERT = certificates.ca;

    expect(await handshake()).toBe("trusted");
  });
});
