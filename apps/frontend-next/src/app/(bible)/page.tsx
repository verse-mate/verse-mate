"use client";

import { MainPage } from "frontend-base";
import { useEffect, useState } from "react";
import AppTourDriver from "../components/AppTourDriver";
import { IntroSplash, shouldShowIntro } from "../components/IntroSplash";

export default function Home() {
  // Tutorial temporarily disabled - will be updated and re-enabled later
  const [runTour, setRunTour] = useState(false);
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
      <AppTourDriver
        run={runTour}
        onComplete={() => {
          setRunTour(false);
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
