"use client";

import React from "react";
import { AdaptiveComponent } from "../components/adaptive/AdaptiveComponent";
import DesktopDownloadAppPage from "./desktop/download-app/DesktopDownloadAppPage";
import MobileDownloadAppPage from "./mobile/download-app/MobileDownloadAppPage";
import TabletDownloadAppPage from "./tablet/download-app/TabletDownloadAppPage";

export default function DownloadApp() {
  return (
    <AdaptiveComponent
      mobileComponent={MobileDownloadAppPage}
      tabletComponent={TabletDownloadAppPage}
      desktopComponent={DesktopDownloadAppPage}
      testId="download-app"
    />
  );
}
