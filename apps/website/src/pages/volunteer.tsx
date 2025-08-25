"use client";

import React from "react";
import { AdaptiveComponent } from "../components/adaptive/AdaptiveComponent";
import DesktopVolunteerPage from "./desktop/volunteer/DesktopVolunteerPage";
import MobileVolunteerPage from "./mobile/volunteer/MobileVolunteerPage";
import TabletVolunteerPage from "./tablet/volunteer/TabletVolunteerPage";

export default function Volunteer() {
  // Mobile adaptive volunteer page with stable React/Next.js versions
  return (
    <AdaptiveComponent
      mobileComponent={MobileVolunteerPage}
      tabletComponent={TabletVolunteerPage}
      desktopComponent={DesktopVolunteerPage}
      testId="volunteer-page"
    />
  );
}
