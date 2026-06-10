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

import lemmaPlugin from "./src/lemmas/lemma.plugin";
import type { LemmaPlugin } from "./src/lemmas/lemma.plugin";

import supportPlugin from "./src/support/support.plugin";
import type { SupportPlugin } from "./src/support/support.plugin";

import offlinePlugin from "./src/offline/offline.plugin";
import type { OfflinePlugin } from "./src/offline/offline.plugin";

import versionPolicyPlugin from "./src/versionPolicy.plugin";
import type { VersionPolicyPlugin } from "./src/versionPolicy.plugin";

import dailyVersePlugin from "./src/daily-verse/daily-verse.plugin";
import type { DailyVersePlugin } from "./src/daily-verse/daily-verse.plugin";

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
  type LemmaPlugin,
  lemmaPlugin,
  type HealthCheckPlugin,
  healthCheckPlugin,
  type SupportPlugin,
  supportPlugin,
  type OfflinePlugin,
  offlinePlugin,
  type VersionPolicyPlugin,
  versionPolicyPlugin,
  type DailyVersePlugin,
  dailyVersePlugin,
};
