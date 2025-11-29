"use client";

import { MainPage } from "frontend-base";
import { useEffect, useState } from "react";
import AppTourDriver from "../components/AppTourDriver";

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
