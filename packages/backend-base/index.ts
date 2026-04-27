import adminPlugin from "./src/admin/admin.plugin";
import type { AdminPlugin } from "./src/admin/admin.plugin";
import authPlugin from "./src/auth/auth.plugin";
import type { AuthPlugin } from "./src/auth/auth.plugin";
import audioPlugin from "./src/bible/audio/audio.plugin";
import type { AudioPlugin } from "./src/bible/audio/audio.plugin";
import biblePlugin from "./src/bible/bible.plugin";
import type { BiblePlugin } from "./src/bible/bible.plugin";
import healthCheckPlugin from "./src/healthcheck/healthcheck.plugin";
import type { HealthCheckPlugin } from "./src/healthcheck/healthcheck.plugin";
import userPlugin from "./src/user/user.plugin";
import type { UserPlugin } from "./src/user/user.plugin";

import topicPlugin from "./src/topics/topic.plugin";
import type { TopicPlugin } from "./src/topics/topic.plugin";

import supportPlugin from "./src/support/support.plugin";
import type { SupportPlugin } from "./src/support/support.plugin";

import offlinePlugin from "./src/offline/offline.plugin";
import type { OfflinePlugin } from "./src/offline/offline.plugin";

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
  type AudioPlugin,
  audioPlugin,
  type AdminPlugin,
  adminPlugin,
  type TopicPlugin,
  topicPlugin,
  type HealthCheckPlugin,
  healthCheckPlugin,
  type SupportPlugin,
  supportPlugin,
  type OfflinePlugin,
  offlinePlugin,
};
