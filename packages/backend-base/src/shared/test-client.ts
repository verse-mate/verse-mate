import { treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";

export function getTestClient<T extends Elysia<any, any, any, any, any, any>>(
  plugin: Elysia<any, any, any, any, any, any>,
) {
  return treaty<T>("http://localhost/", {
    fetcher: (path, body) => {
      return plugin.handle(new Request(path as string, body));
    },
  });
}
