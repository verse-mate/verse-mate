import { Elysia } from "elysia";

import adminPlugin from "../admin/admin.plugin";
import authPlugin from "../auth/auth.plugin";
import audioPlugin from "../bible/audio/audio.plugin";
import bibleBrainPlugin from "../bible/bible-brain/bible-brain.plugin";
import biblePlugin from "../bible/bible.plugin";
import coachPlugin from "../coach/coach.plugin";
import corsPlugin from "../cors/cors.plugin";
import crawlersPlugin from "../crawlers/crawlers.plugin";
import dailyVersePlugin from "../daily-verse/daily-verse.plugin";
import healthCheckPlugin from "../healthcheck/healthcheck.plugin";
import jesusPlugin from "../jesus/jesus.plugin";
import lemmaPlugin from "../lemmas/lemma.plugin";
import notificationsPlugin from "../notifications/notifications.plugin";
import offlinePlugin from "../offline/offline.plugin";
import supportPlugin from "../support/support.plugin";
import topicPlugin from "../topics/topic.plugin";
import userPlugin from "../user/user.plugin";
import versionPolicyPlugin from "../versionPolicy.plugin";

export function contractApp() {
  return new Elysia()
    .use(crawlersPlugin)
    .get("/favicon.ico", () => new Response(null, { status: 204 }))
    .use(authPlugin)
    .use(userPlugin)
    .use(biblePlugin)
    .use(coachPlugin)
    .use(dailyVersePlugin)
    .use(notificationsPlugin)
    .use(audioPlugin)
    .use(bibleBrainPlugin)
    .use(topicPlugin)
    .use(jesusPlugin)
    .use(lemmaPlugin)
    .use(supportPlugin)
    .use(adminPlugin)
    .use(offlinePlugin)
    .use(healthCheckPlugin)
    .use(versionPolicyPlugin)
    .use(corsPlugin);
}
