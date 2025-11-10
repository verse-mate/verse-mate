"use client";

import { MainPage } from "frontend-base";
import { useState } from "react";
import { AppTour } from "../components/AppTour";

export default function Home() {
  // TEMPORARY: Set to true to test the tour, then implement proper first-visit logic
  const [runTour, setRunTour] = useState(true);

  // DEBUG: To keep dropdown open for inspection, go to:
  // packages/frontend-base/src/ui/LeftPanel/HeaderPanel/header-panel.tsx
  // and set forceDropdownOpen={true} on line 457

  return (
    <>
      <AppTour
        run={runTour}
        onComplete={() => {
          setRunTour(false);
          console.log("Tour completed!");
        }}
      />
      <MainPage.MainContent />
    </>
  );
}
