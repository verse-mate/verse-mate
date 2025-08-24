"use client";

import React from "react";
import { AdaptiveComponent } from "../components/adaptive/AdaptiveComponent";
import DesktopHomePage from "./desktop/home/DesktopHomePage";
import MobileHomePage from "./mobile/home/MobileHomePage";
import TabletHomePage from "./tablet/home/TabletHomePage";

export default function Home() {
  return (
    <AdaptiveComponent
      mobileComponent={MobileHomePage}
      tabletComponent={TabletHomePage}
      desktopComponent={DesktopHomePage}
      testId="homepage"
    />
  );
}
