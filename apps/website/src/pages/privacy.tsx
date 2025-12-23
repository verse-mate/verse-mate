"use client";

import React from "react";
import { AdaptiveComponent } from "../components/adaptive/AdaptiveComponent";
import DesktopPrivacyPage from "./desktop/privacy/DesktopPrivacyPage";
import MobilePrivacyPage from "./mobile/privacy/MobilePrivacyPage";
import TabletPrivacyPage from "./tablet/privacy/TabletPrivacyPage";

export default function Privacy() {
  return (
    <AdaptiveComponent
      mobileComponent={MobilePrivacyPage}
      tabletComponent={TabletPrivacyPage}
      desktopComponent={DesktopPrivacyPage}
      testId="privacy-page"
    />
  );
}
