"use client";

import { MainPage } from "frontend-base";
import { useEffect, useState } from "react";
import { IntroSplash, shouldShowIntro } from "../components/IntroSplash";

export default function Home() {
  // Tutorial temporarily disabled - will be updated and re-enabled later
  const [showIntro, setShowIntro] = useState(false);

  // Commented out to disable tutorial
  // useEffect(() => {
  //   try {
  //     const completed =
  //       typeof window !== "undefined" &&
  //       localStorage.getItem("vm_tour_completed") === "1";
  //     setRunTour(!completed);
  //   } catch {
  //     setRunTour(false);
  //   }
  // }, []);

  useEffect(() => {
    try {
      if (shouldShowIntro()) {
        setShowIntro(true);
      }
    } catch {
      setShowIntro(false);
    }
  }, []);

  return (
    <>
      <IntroSplash open={showIntro} onClose={() => setShowIntro(false)} />
      <MainPage.MainContent />
    </>
  );
}
