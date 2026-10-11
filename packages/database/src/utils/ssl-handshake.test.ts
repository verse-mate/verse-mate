import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, type Server, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TLSSocket } from "node:tls";
import pg from "pg";
import { getCleanConnectionString, getSSLConfig } from "./ssl-config";

type Handshake = "trusted" | "refused";

const SSL_REQUEST_LENGTH = 8;

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
  let server: Server;
  let port: number;
  let waiting: ((outcome: Handshake) => void) | undefined;

  beforeAll(async () => {
    server = createServer((socket) => {
      socket.once("data", (request) => {
        if (request.length !== SSL_REQUEST_LENGTH) return socket.destroy();
        socket.write("S");
        const secure = new TLSSocket(socket, {
          isServer: true,
          key: certificates.key,
          cert: certificates.cert,
        });
        secure.once("secure", () => {
          waiting?.("trusted");
          secure.destroy();
        });
        secure.once("error", () => waiting?.("refused"));
        secure.once("close", () => waiting?.("refused"));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
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
    server.close();
  });

  async function handshake(): Promise<Handshake> {
    process.env.POSTGRES_URL = `postgresql://app:secret@localhost:${port}/app?sslmode=require`;
    const outcome = new Promise<Handshake>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no handshake")), 5000);
      waiting = (result) => {
        clearTimeout(timer);
        waiting = undefined;
        resolve(result);
      };
    });
    const client = new pg.Client({
      connectionString: getCleanConnectionString(),
      ssl: getSSLConfig(),
    });
    client.on("error", () => undefined);
    client.connect().catch(() => undefined);
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
