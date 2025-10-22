import { Elysia } from "elysia";
import { StandardErrorResponses } from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import { HealthCheckService } from "./healthcheck.service";
import {
  CacheHealthSchema,
  DatabaseHealthSchema,
  OverallHealthSchema,
} from "./schemas/healthcheck-response.schema";

const plugin = new Elysia()
  .use(shared)
  .state((state) => ({
    ...state,
    HealthCheckService: new HealthCheckService(state.db, state.cache),
  }))
  .group("/health", (app) =>
    app
      .get(
        "/database",
        async ({ store: { HealthCheckService } }) => {
          return await HealthCheckService.checkDatabase();
        },
        {
          response: {
            200: DatabaseHealthSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/cache",
        async ({ store: { HealthCheckService } }) => {
          return await HealthCheckService.checkCache();
        },
        {
          response: {
            200: CacheHealthSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "",
        async ({ set, store: { HealthCheckService } }) => {
          const healthcheck = await HealthCheckService.checkAll();
          set.status = healthcheck.status === "ok" ? 200 : 500;
          return healthcheck;
        },
        {
          response: {
            200: OverallHealthSchema,
            ...StandardErrorResponses,
          },
        },
      ),
  );

export type HealthCheckPlugin = typeof plugin;

export default plugin;
