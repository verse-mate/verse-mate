import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { adminPlugin, authPlugin, biblePlugin, userPlugin } from "backend-base";
import { Elysia } from "elysia";

const app = new Elysia()
  .use(authPlugin)
  .use(userPlugin)
  .use(biblePlugin)
  .use(adminPlugin)
  .use(cors())
  .use(swagger());

app.listen(process.env.PORT || 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
