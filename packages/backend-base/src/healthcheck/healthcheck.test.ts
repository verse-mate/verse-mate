import { describe, expect, it } from "bun:test";

import { getTestClient } from "../shared/test-client";
import Backend, { type HealthCheckPlugin } from "./healthcheck.plugin";

describe("Healthcheck", () => {
  const client = getTestClient<HealthCheckPlugin>(Backend);

  it("GET /health - overall health status check", async () => {
    const { data, error } = await client.health.get();

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    expect(data?.status).toBe("ok");
    expect(data?.database).toBeDefined();
    expect(data?.cache).toBeDefined();
    expect(data?.database.status).toBe("ok");
    expect(data?.cache.status).toBe("ok");
  });

  it("GET /health/database - database connection check", async () => {
    const { data, error } = await client.health.database.get();

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    expect(data?.status).toBe("ok");
    expect(data?.message).toBe("database connection ok");
  });

  it("GET /health/cache - Redis connection check", async () => {
    const { data, error } = await client.health.cache.get();

    expect(error).toBeFalsy();
    expect(data).toBeTruthy();
    expect(data?.status).toBe("ok");
    expect(data?.message).toBe("cache connection ok");
  });
});
