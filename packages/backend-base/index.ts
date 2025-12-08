import adminPlugin from "./src/admin/admin.plugin";
import type { AdminPlugin } from "./src/admin/admin.plugin";
import authPlugin from "./src/auth/auth.plugin";
import type { AuthPlugin } from "./src/auth/auth.plugin";
import biblePlugin from "./src/bible/bible.plugin";
import type { BiblePlugin } from "./src/bible/bible.plugin";
import userPlugin from "./src/user/user.plugin";
import type { UserPlugin } from "./src/user/user.plugin";
import healthCheckPlugin from "./src/healthcheck/healthcheck.plugin";
import type { HealthCheckPlugin } from "./src/healthcheck/healthcheck.plugin";

import topicPlugin from "./src/topics/topic.plugin";
import type { TopicPlugin } from "./src/topics/topic.plugin";

export {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  InternalServerError,
} from "./src/common/errors";

export {
  type AuthPlugin,
  authPlugin,
  type UserPlugin,
  userPlugin,
  type BiblePlugin,
  biblePlugin,
  type AdminPlugin,
  adminPlugin,
  type TopicPlugin,
  topicPlugin,
  type HealthCheckPlugin,
  healthCheckPlugin,
};
