import { afterEach, describe, expect, it } from "bun:test";
import { getCleanConnectionString, getSSLConfig } from "./ssl-config";

const ORIGINAL_URL = process.env.POSTGRES_URL;
const ORIGINAL_CA = process.env.POSTGRES_CA_CERT;
const BASE_URL = "postgresql://app:secret@db.example.test:25060/app";
const MANAGED_URL = `${BASE_URL}?sslmode=require`;
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

  it("turns literal \\n escapes in the CA into line breaks", () => {
    process.env.POSTGRES_URL = MANAGED_URL;
    process.env.POSTGRES_CA_CERT = CA.replace(/\n/g, "\\n");

    expect(getSSLConfig()).toEqual({ rejectUnauthorized: true, ca: CA });
  });

  it("verifies against the system CAs when no CA is configured", () => {
    process.env.POSTGRES_URL = MANAGED_URL;
    Reflect.deleteProperty(process.env, "POSTGRES_CA_CERT");

    expect(getSSLConfig()).toEqual({ rejectUnauthorized: true });
  });

  for (const mode of ["require", "verify-ca", "verify-full"]) {
    it(`verifies the certificate for sslmode=${mode}`, () => {
      process.env.POSTGRES_URL = `${BASE_URL}?application_name=api&sslmode=${mode}`;
      process.env.POSTGRES_CA_CERT = CA;

      expect(getSSLConfig()).toEqual({ rejectUnauthorized: true, ca: CA });
    });
  }

  it("leaves TLS off for a local database without sslmode", () => {
    process.env.POSTGRES_URL = "postgresql://app:secret@localhost:5432/app";
    process.env.POSTGRES_CA_CERT = CA;

    expect(getSSLConfig()).toBe(false);
  });

  it("leaves TLS off for sslmode=disable", () => {
    process.env.POSTGRES_URL = `${BASE_URL}?sslmode=disable`;

    expect(getSSLConfig()).toBe(false);
  });

  it("leaves TLS off when no URL is set", () => {
    Reflect.deleteProperty(process.env, "POSTGRES_URL");

    expect(getSSLConfig()).toBe(false);
  });

  for (const mode of ["no-verify", "prefer", "allow", "requires"]) {
    it(`refuses sslmode=${mode}, which would turn verification off`, () => {
      process.env.POSTGRES_URL = `${BASE_URL}?sslmode=${mode}`;

      expect(() => getSSLConfig()).toThrow(`"${mode}"`);
    });
  }

  it("refuses a POSTGRES_URL it cannot parse instead of leaving TLS off", () => {
    process.env.POSTGRES_URL =
      "postgresql://app:p#ss@db.example.test:25060/app?sslmode=require";

    expect(() => getSSLConfig()).toThrow("POSTGRES_URL is not a valid URL");
    expect(() => getCleanConnectionString()).toThrow(
      "POSTGRES_URL is not a valid URL",
    );
  });

  it("refuses a URL that repeats sslmode with an unsupported value", () => {
    process.env.POSTGRES_URL = `${MANAGED_URL}&sslmode=no-verify`;

    expect(() => getSSLConfig()).toThrow('"no-verify"');
  });
});

describe("Postgres connection string", () => {
  afterEach(() => {
    restore("POSTGRES_URL", ORIGINAL_URL);
  });

  function cleaned(url: string) {
    process.env.POSTGRES_URL = url;
    return getCleanConnectionString();
  }

  it("strips sslmode from the connection string", () => {
    expect(cleaned(MANAGED_URL)).toBe(BASE_URL);
  });

  it("keeps parameters that come before sslmode", () => {
    expect(cleaned(`${BASE_URL}?application_name=api&sslmode=require`)).toBe(
      `${BASE_URL}?application_name=api`,
    );
  });

  it("keeps parameters that come after sslmode", () => {
    expect(cleaned(`${BASE_URL}?sslmode=verify-full&connect_timeout=10`)).toBe(
      `${BASE_URL}?connect_timeout=10`,
    );
  });

  it("keeps parameters on both sides and removes every sslmode", () => {
    expect(
      cleaned(
        `${BASE_URL}?application_name=api&sslmode=require&connect_timeout=10&sslmode=require`,
      ),
    ).toBe(`${BASE_URL}?application_name=api&connect_timeout=10`);
  });

  it("does not touch a parameter whose name only ends in sslmode", () => {
    expect(cleaned(`${BASE_URL}?x_sslmode=require&sslmode=require`)).toBe(
      `${BASE_URL}?x_sslmode=require`,
    );
  });

  it("returns a URL without sslmode unchanged", () => {
    const url = "postgresql://app:secret@localhost:5432/app?connect_timeout=10";

    expect(cleaned(url)).toBe(url);
  });
});
