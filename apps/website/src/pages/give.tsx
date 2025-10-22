"use client";

import React from "react";
import { AdaptiveComponent } from "../components/adaptive/AdaptiveComponent";
import DesktopDonatePage from "./desktop/donate/DesktopDonatePage";
import MobileDonatePage from "./mobile/donate/MobileDonatePage";
import TabletDonatePage from "./tablet/donate/TabletDonatePage";

export default function Give() {
  // Adaptive donate page with Desktop form functionality
  return (
    <AdaptiveComponent
      mobileComponent={MobileDonatePage}
      tabletComponent={TabletDonatePage}
      desktopComponent={DesktopDonatePage}
      testId="donate-page"
    />
  );
}
