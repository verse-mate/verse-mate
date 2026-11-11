import { describe, expect, it } from "bun:test";
import { appStoreLink, pageSlug, playStoreLink, smartBannerContent } from "../lib/store-links";

describe("store links", () => {
  it("names the page and channel in the App Store campaign token", () => {
    const url = new URL(appStoreLink({ page: "download-app", channel: "ai" }));
    expect(url.origin + url.pathname).toBe(
      "https://apps.apple.com/app/apple-store/id6756897180",
    );
    expect(url.searchParams.get("ct")).toBe("web-download-app-ai");
    expect(url.searchParams.get("mt")).toBe("8");
  });

  it("keeps the whole token for the longest channel on the download page", () => {
    const url = new URL(appStoreLink({ page: "download-app", channel: "campaign" }));
    expect(url.searchParams.get("ct")).toBe("web-download-app-campaign");
  });

  it("cuts an over-long token to 40 characters", () => {
    const url = new URL(appStoreLink({ page: "x".repeat(50), channel: "ai" }));
    expect(url.searchParams.get("ct")).toHaveLength(40);
  });

  it("names channel none when no first touch is known", () => {
    const app = new URL(appStoreLink({ page: "download-app", channel: "none" }));
    const play = new URL(playStoreLink({ page: "download-app", channel: "none" }));
    expect(app.searchParams.get("ct")).toBe("web-download-app-none");
    expect(play.searchParams.get("referrer")).toBe(
      "utm_source=versemate.org&utm_medium=download-app&utm_campaign=none",
    );
  });

  it("puts the three UTMs in the Play referrer", () => {
    const url = new URL(playStoreLink({ page: "download-app", channel: "ai" }));
    expect(url.searchParams.get("id")).toBe("org.versemate.app");
    expect(url.searchParams.get("referrer")).toBe(
      "utm_source=versemate.org&utm_medium=download-app&utm_campaign=ai",
    );
  });

  it("slugs pages", () => {
    expect(pageSlug("/")).toBe("home");
    expect(pageSlug("/download-app/")).toBe("download-app");
    expect(pageSlug("/coach/notetaker/")).toBe("coach-notetaker");
  });

  it("gives the banner a fixed campaign token", () => {
    expect(smartBannerContent()).toBe(
      "app-id=6756897180, affiliate-data=ct=web-banner&mt=8",
    );
  });
});
