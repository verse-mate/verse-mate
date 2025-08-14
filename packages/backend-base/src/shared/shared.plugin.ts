import { bearer } from "@elysiajs/bearer";
import { cors } from "@elysiajs/cors";
import { jwt as ElysiaJwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia, t } from "elysia";
import { User } from "../user/entities/user.entity";
import { UserService } from "../user/user.service";

import { EmailNotificationConsumer } from "../queue/consumers/email-notification.consumer";
import redisClient from "./redis-client";

export type cache = typeof redisClient;

export type db = typeof Database;

const jwt = ElysiaJwt({
  name: "jwt",
  secret: process.env.AUTH_ACCESS_TOKEN_SECRET ?? "my-super-secret",
  exp: process.env.AUTH_ACCESS_TOKEN_LIFETIME ?? "1h",
});

export type JWT = (typeof jwt)["decorator"]["jwt"];

// const storage = new ObjectStorageService();

const setup = new Elysia({ name: "shared" })
  .use(cors())
  .use(bearer())
  .use(jwt)
  .state("db", Database)
  .state("cache", redisClient)
  .state("notification", new EmailNotificationConsumer())
  .derive(async ({ jwt, cookie: { auth }, store }) => {
    const payload = await jwt.verify(auth?.value);
    if (!payload) {
      return { user: null };
    }

    const userService = new UserService(store.db);
    const user = await userService.findOne(payload.id as string);

    return {
      user,
    };
  })
  .macro(({ onBeforeHandle }) => {
    return {
      isAuthenticated() {
        onBeforeHandle(({ user, set }) => {
          if (!user) {
            set.status = 401;
            return "Unauthorized";
          }
        });
      },
    };
  });

setup.onStop(() => {
  console.log("onStop on shared plugin");
  Database.closeConnection();
  redisClient.disconnect();
});

export default setup;
