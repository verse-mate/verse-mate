"use client";

import { useCallback, useEffect, useState } from "react";

export const useHeader = () => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const handleResize = useCallback(() => {
    setIsSmallScreen(window.innerWidth <= 480);
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize]);

  return { isSmallScreen };
};
