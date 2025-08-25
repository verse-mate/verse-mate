/**
 * Adaptive Volunteer Page that switches between device-specific implementations
 */

"use client";

import React from "react";
import { AdaptiveComponent } from "../../../components/adaptive/AdaptiveComponent";
import DesktopVolunteerPage from "../../desktop/volunteer/DesktopVolunteerPage";
import MobileVolunteerPage from "../../mobile/volunteer/MobileVolunteerPage";
import TabletVolunteerPage from "../../tablet/volunteer/TabletVolunteerPage";

export default function AdaptiveVolunteerPage() {
  return (
    <AdaptiveComponent
      mobileComponent={MobileVolunteerPage}
      tabletComponent={TabletVolunteerPage}
      desktopComponent={DesktopVolunteerPage}
      props={{}}
      testId="adaptive-volunteer-page"
    />
  );
}
