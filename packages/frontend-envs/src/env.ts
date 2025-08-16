import { type StoreValue, map } from "nanostores";

export const $env = map({
  apiUrl: "http://localhost:4000",
  askVerseMate: false,
});

export type Env = StoreValue<typeof $env>;
