import { type StoreValue, map } from "nanostores";

export const $env = map({
  apiUrl: "http://localhost:3000",
  askVerseMate: false,
});

export type Env = StoreValue<typeof $env>;
