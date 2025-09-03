/**
 * Adaptive component wrapper that renders device-specific components
 */

"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { type DeviceType, useDevice } from "../../hooks/useDevice";

interface AdaptiveComponentProps<
  T extends Record<string, any> = Record<string, any>,
> {
  mobileComponent: React.ComponentType<T>;
  tabletComponent: React.ComponentType<T>;
  desktopComponent: React.ComponentType<T>;
  props?: T;
  fallback?: DeviceType;
  testId?: string;
}

export function AdaptiveComponent<
  T extends Record<string, any> = Record<string, any>,
>({
  mobileComponent: MobileComponent,
  tabletComponent: TabletComponent,
  desktopComponent: DesktopComponent,
  props = {} as T,
  fallback = "mobile",
  testId,
}: AdaptiveComponentProps<T>) {
  const device = useDevice();
  const [isMounted, setIsMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Add transition class for smooth switching
  useEffect(() => {
    if (isMounted) {
      const timeout = setTimeout(() => {
        // Add any post-mount logic here if needed
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [isMounted, device.type]);

  // During SSR and before mount, always render the fallback component
  if (!isMounted) {
    let FallbackComponent;
    switch (fallback) {
      case "mobile":
        FallbackComponent = MobileComponent;
        break;
      case "tablet":
        FallbackComponent = TabletComponent;
        break;
      default:
        FallbackComponent = MobileComponent;
    }

    return (
      <div
        data-testid={testId ? `${testId}-${fallback}` : undefined}
        data-device-type={fallback}
        className={`adaptive-component adaptive-component--${fallback}`}
      >
        <FallbackComponent {...props} />
      </div>
    );
  }

  // After mount, render the appropriate component based on device type
  let Component;
  switch (device.type) {
    case "mobile":
      Component = MobileComponent;
      break;
    case "tablet":
      Component = TabletComponent;
      break;
    case "desktop":
      Component = DesktopComponent;
      break;
    default:
      // Fallback logic
      switch (fallback) {
        case "mobile":
          Component = MobileComponent;
          break;
        case "tablet":
          Component = TabletComponent;
          break;
        default:
          Component = MobileComponent;
      }
  }

  return (
    <div
      data-testid={testId ? `${testId}-${device.type}` : undefined}
      data-device-type={device.type}
      className={`adaptive-component adaptive-component--${device.type} hydrated`}
    >
      <Component {...props} />
    </div>
  );
}

// Higher-order component version for easier usage
export function withAdaptiveDesign<
  T extends Record<string, any> = Record<string, any>,
>(
  mobileComponent: React.ComponentType<T>,
  tabletComponent: React.ComponentType<T>,
  desktopComponent: React.ComponentType<T>,
) {
  return function AdaptiveWrapper(props: T) {
    return (
      <AdaptiveComponent
        mobileComponent={mobileComponent}
        tabletComponent={tabletComponent}
        desktopComponent={desktopComponent}
        props={props}
      />
    );
  };
}
