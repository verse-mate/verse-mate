import { afterEach, describe, expect, it } from "bun:test";
import { RedisClient } from "./redis-client";

const ORIGINAL_CA = process.env.REDIS_CA_CERT;
const MANAGED_URL = "rediss://default:secret@cache.example.test:25061/0";
const CA = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----";

function socketOptions(url: string) {
  return (
    new RedisClient(url) as unknown as {
      client: { options: { socket: Record<string, unknown> } };
    }
  ).client.options.socket;
}

describe("Redis TLS config", () => {
  afterEach(() => {
    if (ORIGINAL_CA === undefined)
      Reflect.deleteProperty(process.env, "REDIS_CA_CERT");
    else process.env.REDIS_CA_CERT = ORIGINAL_CA;
  });

  it("verifies the server certificate against the configured CA", () => {
    process.env.REDIS_CA_CERT = CA;

    const socket = socketOptions(MANAGED_URL);

    expect(socket.tls).toBe(true);
    expect(socket.rejectUnauthorized).toBe(true);
    expect(socket.ca).toBe(CA);
  });

  it("verifies against the system CAs when no CA is configured", () => {
    Reflect.deleteProperty(process.env, "REDIS_CA_CERT");

    const socket = socketOptions(MANAGED_URL);

    expect(socket.tls).toBe(true);
    expect(socket.rejectUnauthorized).toBe(true);
    expect(socket.ca).toBeUndefined();
  });

  it("leaves TLS off for a plain redis:// URL", () => {
    process.env.REDIS_CA_CERT = CA;

    const socket = socketOptions("redis://:secret@localhost:6379/0");

    expect(socket.tls).toBeUndefined();
    expect(socket.rejectUnauthorized).toBeUndefined();
  });
});
