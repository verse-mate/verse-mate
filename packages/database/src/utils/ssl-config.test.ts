import { afterEach, describe, expect, it } from "bun:test";
import { getCleanConnectionString, getSSLConfig } from "./ssl-config";

const ORIGINAL_URL = process.env.POSTGRES_URL;
const ORIGINAL_CA = process.env.POSTGRES_CA_CERT;
const MANAGED_URL =
  "postgresql://app:secret@db.example.test:25060/app?sslmode=require";
const CA = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----";

function restore(name: string, value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else process.env[name] = value;
}

describe("Postgres TLS config", () => {
  afterEach(() => {
    restore("POSTGRES_URL", ORIGINAL_URL);
    restore("POSTGRES_CA_CERT", ORIGINAL_CA);
  });

  it("verifies the server certificate against the configured CA", () => {
    process.env.POSTGRES_URL = MANAGED_URL;
    process.env.POSTGRES_CA_CERT = CA;

    expect(getSSLConfig()).toEqual({ rejectUnauthorized: true, ca: CA });
  });

  it("verifies against the system CAs when no CA is configured", () => {
    process.env.POSTGRES_URL = MANAGED_URL;
    Reflect.deleteProperty(process.env, "POSTGRES_CA_CERT");

    expect(getSSLConfig()).toEqual({ rejectUnauthorized: true });
  });

  it("leaves TLS off for a local database without sslmode", () => {
    process.env.POSTGRES_URL = "postgresql://app:secret@localhost:5432/app";
    process.env.POSTGRES_CA_CERT = CA;

    expect(getSSLConfig()).toBe(false);
  });

  it("strips sslmode from the connection string", () => {
    process.env.POSTGRES_URL = MANAGED_URL;

    expect(getCleanConnectionString()).toBe(
      "postgresql://app:secret@db.example.test:25060/app",
    );
  });
});
