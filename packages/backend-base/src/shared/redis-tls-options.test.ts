import { afterEach, describe, expect, it } from "bun:test";
import { redisTlsOptions } from "./redis-tls";

const ORIGINAL_CA = process.env.REDIS_CA_CERT;
const MANAGED_URL = "rediss://default:secret@cache.example.test:25061/0";
const CA = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----";

describe("Redis TLS options for the queue connection", () => {
  afterEach(() => {
    if (ORIGINAL_CA === undefined)
      Reflect.deleteProperty(process.env, "REDIS_CA_CERT");
    else process.env.REDIS_CA_CERT = ORIGINAL_CA;
  });

  it("verifies the server certificate against the configured CA", () => {
    process.env.REDIS_CA_CERT = CA;

    expect(redisTlsOptions(MANAGED_URL)).toEqual({
      rejectUnauthorized: true,
      ca: CA,
    });
  });

  it("verifies against the system CAs when no CA is configured", () => {
    Reflect.deleteProperty(process.env, "REDIS_CA_CERT");

    expect(redisTlsOptions(MANAGED_URL)).toEqual({ rejectUnauthorized: true });
  });

  it("leaves TLS off for a plain redis:// URL", () => {
    process.env.REDIS_CA_CERT = CA;

    expect(redisTlsOptions("redis://:secret@localhost:6379/0")).toBeUndefined();
  });
});
