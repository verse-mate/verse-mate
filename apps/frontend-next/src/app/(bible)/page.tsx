"use client";

import { MainPage } from "frontend-base";
import { useEffect, useState } from "react";
import { AppTour } from "../components/AppTour";

export default function Home() {
  // Run the tour only once per user based on localStorage flag
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    try {
      const completed =
        typeof window !== "undefined" &&
        localStorage.getItem("vm_tour_completed") === "1";
      setRunTour(!completed);
    } catch {
      // If storage is unavailable, default to not running to avoid annoyance
      setRunTour(false);
    }
  }, []);

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
          try {
            if (typeof window !== "undefined") {
              localStorage.setItem("vm_tour_completed", "1");
            }
          } catch {}
        }}
      />
      <MainPage.MainContent />
    </>
  );
}
