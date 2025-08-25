/**
 * Breakpoint detection hook for responsive design utilities
 */

import { useEffect, useState } from "react";
import { BREAKPOINTS, type DeviceType } from "./useDevice";

export function useBreakpoint(breakpoint: DeviceType): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth;
      const bp = BREAKPOINTS[breakpoint];
      const isMatch = width >= bp.min && width <= bp.max;
      setMatches(isMatch);
    };

    // Initial check
    checkBreakpoint();

    // Listen for resize events
    window.addEventListener("resize", checkBreakpoint);

    return () => {
      window.removeEventListener("resize", checkBreakpoint);
    };
  }, [breakpoint]);

  return matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
