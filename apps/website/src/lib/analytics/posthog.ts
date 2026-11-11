import type { PostHog } from "posthog-js";
import { readFirstTouch, recordFirstTouch } from "./first-touch";
import { scrubEvent } from "./privacy";

const PROBE = "vm_storage_probe";

let client: PostHog | undefined;

type Loader = () => Promise<PostHog>;

const loadPosthog: Loader = () => import("posthog-js").then((module) => module.default);

export function storageAvailable(win: Window): boolean {
  try {
    win.localStorage.setItem(PROBE, "1");
    win.localStorage.removeItem(PROBE);
    win.document.cookie = `${PROBE}=1; path=/; SameSite=Lax`;
    const cookieKept = win.document.cookie.includes(`${PROBE}=1`);
    win.document.cookie = `${PROBE}=; path=/; max-age=0; SameSite=Lax`;
    return cookieKept;
  } catch {
    return false;
  }
}

export async function startAnalytics(win: Window, load: Loader = loadPosthog): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  if (!key || client || !storageAvailable(win)) return;
  const returning = win.localStorage.getItem(`ph_${key}_posthog`) !== null;
  const posthog = await load();
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ["accessToken", "refreshToken", "state", "s"],
    before_send: scrubEvent,
    advanced_disable_feature_flags: true,
    capture_exceptions: false,
    persistence: "localStorage+cookie",
    loaded: (instance) => {
      client = instance;
      instance.register({ surface: "website", platform: "website" });
      recordFirstTouch({
        posthog: instance,
        storage: win.localStorage,
        surface: "website",
        url: win.location.href,
        referrer: win.document.referrer,
        returning,
      });
      instance.capture("$pageview");
    },
  });
}

export function capturePageview(): void {
  client?.capture("$pageview");
}

export function trackStoreLink(store: "app_store" | "play_store", page: string): void {
  if (!client) return;
  const touch = readFirstTouch(window.localStorage);
  client.capture(
    "store_link_clicked",
    { store, page, first_touch_channel: touch?.channel ?? "none" },
    { send_instantly: true },
  );
}
