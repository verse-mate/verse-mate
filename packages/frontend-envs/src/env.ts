import { type StoreValue, map } from "nanostores";

export const $env = map({
  apiUrl: "http://localhost:4000",
  askVerseMate: false,
  ssoGoogleEnabled: false,
  ssoAppleEnabled: false,
  posthogKey: "",
  posthogHost: "https://app.posthog.com",
  posthogSessionReplay: false,
});

export type Env = StoreValue<typeof $env>;
