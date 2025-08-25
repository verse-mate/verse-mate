/**
 * Adaptive layout that switches between device-specific layouts
 */

"use client";

import React, { type ReactNode } from "react";
import { AdaptiveComponent } from "../../components/adaptive/AdaptiveComponent";
import DesktopLayout from "../desktop/DesktopLayout";
import MobileLayout from "../mobile/MobileLayout";
import TabletLayout from "../tablet/TabletLayout";

interface AdaptiveLayoutProps {
  children: ReactNode;
}

export default function AdaptiveLayout({ children }: AdaptiveLayoutProps) {
  return (
    <AdaptiveComponent
      mobileComponent={MobileLayout}
      tabletComponent={TabletLayout}
      desktopComponent={DesktopLayout}
      props={{ children }}
      testId="adaptive-layout"
    />
  );
}
