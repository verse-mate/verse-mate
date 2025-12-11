"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function AppStoreBadges() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">(
    "desktop",
  );

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform("ios");
    else if (/android/.test(ua)) setPlatform("android");
  }, []);

  return (
    <div className="app-store-badges">
      {(platform === "ios" || platform === "desktop") && (
        <a
          href="https://apps.apple.com/app/id6754565256"
          target="_blank"
          rel="noreferrer noopener"
        >
          <Image
            src="/assets/app-store-badge.svg"
            alt="Download on App Store"
            width={150}
            height={50}
          />
        </a>
      )}
      {(platform === "android" || platform === "desktop") && (
        <a
          href="https://play.google.com/store/apps/details?id=org.versemate.mobile"
          target="_blank"
          rel="noreferrer noopener"
        >
          <Image
            src="/assets/google-play-badge.svg"
            alt="Get it on Google Play"
            width={150}
            height={50}
          />
        </a>
      )}
    </div>
  );
}
