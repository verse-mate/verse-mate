import { type StoreValue, map } from "nanostores";

export const $env = map({
  apiUrl: "https://api.verse-mate.apegro.dev",
  askVerseMate: false,
});

export type Env = StoreValue<typeof $env>;
