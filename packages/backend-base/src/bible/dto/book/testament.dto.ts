import TestamentEnum from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";

export const TestamentDto = t.Object({
  b: t.Number(),
  c: t.Number(),
  n: t.String(),
  t: t.Enum(TestamentEnum),
  g: t.Number(),
});

export type TestamentDto = Static<typeof TestamentDto>;
