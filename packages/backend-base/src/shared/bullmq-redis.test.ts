import { afterEach, describe, expect, it } from "bun:test";
import { rootCertificates } from "node:tls";
import { createBullmqRedisConnection } from "./bullmq-redis";

const ORIGINAL_CA = process.env.REDIS_CA_CERT;
const MANAGED_URL = "rediss://default:secret@cache.example.test:25061/0";
const CA = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----";

function tlsOf(url: string) {
  const connection = createBullmqRedisConnection(url);
  const tls = connection.options.tls;
  connection.disconnect();
  return tls;
}

describe("BullMQ Redis connection", () => {
  afterEach(() => {
    if (ORIGINAL_CA === undefined)
      Reflect.deleteProperty(process.env, "REDIS_CA_CERT");
    else process.env.REDIS_CA_CERT = ORIGINAL_CA;
  });

  it("verifies a rediss:// server against the configured CA and the system CAs", () => {
    process.env.REDIS_CA_CERT = CA;

    expect(tlsOf(MANAGED_URL)).toEqual({
      rejectUnauthorized: true,
      ca: [...rootCertificates, CA],
    });
  });

  it("verifies a rediss:// server against the system CAs when no CA is configured", () => {
    Reflect.deleteProperty(process.env, "REDIS_CA_CERT");

    expect(tlsOf(MANAGED_URL)).toEqual({ rejectUnauthorized: true });
  });

  it("leaves TLS off for a plain redis:// URL", () => {
    process.env.REDIS_CA_CERT = CA;

    expect(tlsOf("redis://:secret@localhost:6379/0")).toBeUndefined();
  });
});
