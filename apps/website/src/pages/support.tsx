"use client";

import React from "react";
import { AdaptiveComponent } from "../components/adaptive/AdaptiveComponent";
import DesktopSupportPage from "./desktop/support/DesktopSupportPage";
import MobileSupportPage from "./mobile/support/MobileSupportPage";
import TabletSupportPage from "./tablet/support/TabletSupportPage";

export default function Support() {
  return (
    <AdaptiveComponent
      mobileComponent={MobileSupportPage}
      tabletComponent={TabletSupportPage}
      desktopComponent={DesktopSupportPage}
      testId="support-page"
    />
  );
}
