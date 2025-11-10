"use client";

import { MainPage } from "frontend-base";
import { useState } from "react";
import { AppTour } from "../components/AppTour";

export default function Home() {
  // TEMPORARY: Set to true to test the tour, then implement proper first-visit logic
  const [runTour, setRunTour] = useState(true);

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
