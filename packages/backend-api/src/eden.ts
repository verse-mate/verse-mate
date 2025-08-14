import { treaty } from "@elysiajs/eden";
import type { App } from "backend";
import { $env } from "frontend-envs";

const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
  const original =
    url instanceof Request
      ? new URL(url.url)
      : new URL(url.toString(), window.location.origin);

  // pathname + query   (ex.: /books?limit=10&page=2)
  const pathWithQuery = `${original.pathname}${original.search}`;

  return fetch(`${$env.get().apiUrl}${pathWithQuery}`, {
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
