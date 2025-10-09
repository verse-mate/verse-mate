import { t } from "elysia";

/**
 * Healthcheck response schemas
 */
export const DatabaseHealthSchema = t.Object({
  status: t.Union([t.Literal("ok"), t.Literal("fail")]),
  message: t.String(),
});

export const CacheHealthSchema = t.Object({
  status: t.Union([t.Literal("ok"), t.Literal("fail")]),
  message: t.String(),
});

export const OverallHealthSchema = t.Object({
  status: t.Union([t.Literal("ok"), t.Literal("fail")]),
  database: t.Object({
    status: t.Union([t.Literal("ok"), t.Literal("fail")]),
    message: t.String(),
  }),
  cache: t.Object({
    status: t.Union([t.Literal("ok"), t.Literal("fail")]),
    message: t.String(),
  }),
});
