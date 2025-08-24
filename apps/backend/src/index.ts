import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { adminPlugin, authPlugin, biblePlugin, notesPlugin, userPlugin } from "backend-base";
import { Elysia } from "elysia";

const app = new Elysia()
  .use(authPlugin)
  .use(userPlugin)
  .use(biblePlugin)
  .use(notesPlugin)
  .use(adminPlugin)
  .use(cors())
  .use(swagger());

app.listen(process.env.PORT || 4000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
