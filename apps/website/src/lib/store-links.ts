import { APP_STORE_ID, APP_STORE_PROVIDER_TOKEN } from "@/lib/structured-data";

const SITE_HOST = "versemate.org";
const SITE_TAG = "web";
const MAX_CAMPAIGN_TOKEN = 40;
const PLAY_PACKAGE = "org.versemate.app";

export type StoreLinkTarget = { page: string; channel: string };

export function pageSlug(pathname: string): string {
  const slug = pathname.split("/").filter(Boolean).join("-");
  return slug || "home";
}

function campaignToken(parts: string[]): string {
  return parts.join("-").slice(0, MAX_CAMPAIGN_TOKEN);
}

function appStoreCampaign(ct: string): URLSearchParams {
  const params = new URLSearchParams();
  if (APP_STORE_PROVIDER_TOKEN) params.set("pt", APP_STORE_PROVIDER_TOKEN);
  params.set("ct", ct);
  params.set("mt", "8");
  return params;
}

export function appStoreLink({ page, channel }: StoreLinkTarget): string {
  const params = appStoreCampaign(campaignToken([SITE_TAG, page, channel]));
  return `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?${params}`;
}

export function playStoreLink({ page, channel }: StoreLinkTarget): string {
  const referrer = new URLSearchParams({
    utm_source: SITE_HOST,
    utm_medium: page,
    utm_campaign: channel,
  });
  const params = new URLSearchParams({ id: PLAY_PACKAGE, referrer: referrer.toString() });
  return `https://play.google.com/store/apps/details?${params}`;
}

export function smartBannerContent(): string {
  const params = appStoreCampaign(`${SITE_TAG}-banner`);
  return `app-id=${APP_STORE_ID}, affiliate-data=${params}`;
}
