import { Elysia, t } from "elysia";
import shared from "../shared/shared.plugin";
import { HealthCheckService } from "./healthcheck.service";

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    HealthCheckService: new HealthCheckService(state.db, state.cache),
  }))
  .group("/health", (app) =>
    app
      .get("/database", async ({ store: { HealthCheckService } }) => {
        return await HealthCheckService.checkDatabase();
      })
      .get("/cache", async ({ store: { HealthCheckService } }) => {
        return await HealthCheckService.checkCache();
      })
      .get("", async ({ set, store: { HealthCheckService } }) => {
        const healthcheck = await HealthCheckService.checkAll();
        set.status = healthcheck.status === "ok" ? 200 : 500;
        return healthcheck;
      }),
  );

export type HealthCheckPlugin = typeof plugin;

export default plugin;
