/**
 * Device detection hook for adaptive design
 */

"use client";

import { useEffect, useState } from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  viewport: {
    width: number;
    height: number;
  };
  orientation: "portrait" | "landscape";
}

export const BREAKPOINTS = {
  mobile: { min: 0, max: 767 },
  tablet: { min: 768, max: 1023 },
  desktop: { min: 1024, max: Number.POSITIVE_INFINITY },
} as const;

export function useDevice(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    // Server-side rendering fallback - use mobile-first approach
    if (typeof window === "undefined") {
      return {
        type: "mobile",
        isMobile: true,
        isTablet: false,
        isDesktop: false,
        isTouch: true,
        viewport: { width: 375, height: 667 },
        orientation: "portrait",
      };
    }

    return getDeviceInfo();
  });

  useEffect(() => {
    const updateDevice = () => {
      setDeviceInfo(getDeviceInfo());
    };

    updateDevice();
    window.addEventListener("resize", updateDevice);
    window.addEventListener("orientationchange", updateDevice);

    return () => {
      window.removeEventListener("resize", updateDevice);
      window.removeEventListener("orientationchange", updateDevice);
    };
  }, []);

  return deviceInfo;
}

function getDeviceInfo(): DeviceInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Determine device type based on viewport width
  let deviceType: DeviceType = "desktop";
  if (width <= BREAKPOINTS.mobile.max) {
    deviceType = "mobile";
  } else if (width <= BREAKPOINTS.tablet.max) {
    deviceType = "tablet";
  }

  // Enhanced tablet detection for touch devices
  if (
    isTouchDevice &&
    width >= BREAKPOINTS.tablet.min &&
    width <= BREAKPOINTS.tablet.max
  ) {
    deviceType = "tablet";
  }

  const orientation: "portrait" | "landscape" =
    width < height ? "portrait" : "landscape";

  return {
    type: deviceType,
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    isTouch: deviceType !== "desktop" || isTouchDevice,
    viewport: { width, height },
    orientation,
  };
}
