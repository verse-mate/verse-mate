import { bearer } from "@elysiajs/bearer";
import { cors } from "@elysiajs/cors";
import { jwt as ElysiaJwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";

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
  // .use(bearer())
  .use(jwt)
  .state("db", Database)
  .state("cache", redisClient)
  .state("notification", new EmailNotificationConsumer());
// .state("storage", storage);

setup.onStop(() => {
  console.log("onStop on shared plugin");
  Database.closeConnection();
  redisClient.disconnect();
});

export default setup;
