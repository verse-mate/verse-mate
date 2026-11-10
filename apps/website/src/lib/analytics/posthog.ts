import posthog from "posthog-js";
import { readFirstTouch, recordFirstTouch } from "./first-touch";
import { scrubEvent } from "./privacy";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const PROBE = "vm_storage_probe";

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

function enabled(): boolean {
  try {
    return posthog.__loaded === true;
  } catch {
    return false;
  }
}

export function startAnalytics(): void {
  if (!POSTHOG_KEY || typeof window === "undefined" || enabled()) return;
  if (!storageAvailable(window)) return;
  const returning =
    window.localStorage.getItem(`ph_${POSTHOG_KEY}_posthog`) !== null;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ["accessToken", "refreshToken", "state", "s"],
    before_send: scrubEvent,
    advanced_disable_feature_flags: true,
    capture_exceptions: false,
    persistence: "localStorage+cookie",
    loaded: (instance) => {
      instance.register({ surface: "website", platform: "website" });
      recordFirstTouch({
        posthog: instance,
        storage: window.localStorage,
        surface: "website",
        url: window.location.href,
        referrer: document.referrer,
        returning,
      });
      instance.capture("$pageview");
    },
  });
}

export function capturePageview(): void {
  if (enabled()) posthog.capture("$pageview");
}

export function trackStoreLink(store: "app_store" | "play_store", page: string): void {
  if (!enabled()) return;
  const touch = readFirstTouch(window.localStorage);
  posthog.capture("store_link_clicked", {
    store,
    page,
    first_touch_channel: touch?.channel ?? "none",
  });
}
