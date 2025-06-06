import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
  let pathname = "";
  if (!(url instanceof Request)) {
    pathname = new URL(url).pathname;
  }

  return fetch(`${$env.get().apiUrl}${pathname}`, {
    ...init,
    headers: {
      ...{ "Access-Control-Allow-Origin": "*" },
      ...(init?.headers as any),
    },
  });
};

export const api = treaty<App>($env.get().apiUrl, {
  fetcher,
  onResponse(response) {
    if (response.status === 401) {
      window.location.href = "/logout";
    }
  },
});
