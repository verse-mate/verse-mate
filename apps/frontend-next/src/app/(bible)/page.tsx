"use client";

import { MainPage } from "frontend-base";
import { useEffect, useState } from "react";
import { AppTour } from "../components/AppTour";

export default function Home() {
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    try {
      const completed =
        typeof window !== "undefined" &&
        localStorage.getItem("vm_tour_completed") === "1";
      setRunTour(!completed);
    } catch {
      setRunTour(false);
    }
  }, []);

  return (
    <>
      <AppTour
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
