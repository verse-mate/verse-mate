/**
 * Mobile Volunteer Landing Page
 */

"use client";

import React from "react";
import MobileCTA from "../../../components/mobile/CTA/MobileCTA";
import MobileHero from "../../../components/mobile/Hero/MobileHero";
import MobileTeam from "../../../components/mobile/Team/MobileTeam";

export default function MobileVolunteerPage() {
  return (
    <div data-testid="mobile-volunteer-page">
      <MobileHero />
      <MobileTeam />
      <MobileCTA />
    </div>
  );
}
