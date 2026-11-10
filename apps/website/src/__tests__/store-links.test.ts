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

  it("keeps the campaign token within 40 characters", () => {
    const ct = new URL(
      appStoreLink({ page: pageSlug("/coach/notetaker/connected/very-long-page/"), channel: "campaign" }),
    ).searchParams.get("ct");
    expect(ct?.length).toBeLessThanOrEqual(40);
    expect(ct?.startsWith("web-")).toBe(true);
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
    expect(smartBannerContent()).toContain("app-id=6756897180");
    expect(smartBannerContent()).toContain("affiliate-data=");
    expect(smartBannerContent()).toContain("ct=web-banner");
  });
});
