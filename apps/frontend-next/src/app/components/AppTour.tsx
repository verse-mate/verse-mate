"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Joyride, {
  type CallBackProps,
  EVENTS,
  type Step,
  STATUS,
} from "react-joyride";
import "./AppTour.css";

interface AppTourProps {
  run?: boolean;
  onComplete?: () => void;
}

export const AppTour = ({ run = false, onComplete }: AppTourProps) => {
  const [tourRun, setTourRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showGuidedTour, setShowGuidedTour] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const clickCleanupRef = useRef<(() => void) | null>(null);

  // Detect mobile vs desktop and small screens
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsSmallScreen(window.innerWidth <= 400);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Utility function to attach delegated click handlers
  const attachDelegatedClick = useCallback(
    (selector: string, onMatch: (targetEl: HTMLElement) => void) => {
      const handler = (e: Event) => {
        const node = e.target as HTMLElement | null;
        const matched = node?.closest?.(selector) as HTMLElement | null;
        if (matched) {
          onMatch(matched);
          // Cleanup after first match
          if (clickCleanupRef.current) {
            clickCleanupRef.current();
            clickCleanupRef.current = null;
          }
        }
      };
      // Use pointerdown to catch Radix triggers that open on pointer events, and click as fallback
      document.addEventListener("pointerdown", handler as any, true);
      document.addEventListener("click", handler as any, true);
      clickCleanupRef.current = () => {
        document.removeEventListener("pointerdown", handler as any, true);
        document.removeEventListener("click", handler as any, true);
      };
    },
    [],
  );

  // Basic tutorial steps (just showing elements)
  const basicSteps: Step[] = [
    {
      target: "body",
      content:
        "Welcome to VerseMate! Let's take a quick tour of the main features.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: '[data-tour="chapter-title"]',
      content: "This shows the current book and chapter you're reading.",
      placement: "top",
    },
    {
      target: '[data-tour="chapter-content"]',
      content:
        "The main content displays Bible verses. Select text to highlight, bookmark, or add notes.",
      placement: "bottom",
    },
    {
      target: '[data-tour="book-selector"]',
      content:
        "Browse and select books from Old Testament, New Testament, or Topics.",
      placement: "bottom",
    },
    {
      target: '[data-tour="action-buttons"]',
      content:
        "Quick actions: Bookmark chapters, add notes, copy or share passages.",
      placement: "bottom",
    },
    {
      target: '[data-tour="explanation-types-desktop"]',
      content:
        "Choose AI explanation types: Summary, By Line, or Detailed commentary.",
      placement: "bottom",
    },
    {
      target: '[data-tour="menu-button-desktop"]',
      content: "Access your bookmarks, notes, highlights, and settings.",
      placement: "left",
    },
  ];

  // Guided tour steps (interactive - click on highlighted elements)
  const guidedSteps: Step[] = [
    {
      target: "body",
      content:
        "Great! Now let's learn how to navigate between books. Click Next to continue.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: '[data-tour="book-selector"]',
      content: "Click on this book selector to open the navigation menu.",
      placement: "bottom",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "8px",
        },
      },
    },
    {
      target: '[data-tour="nt-tab"]',
      content: "Click on 'New Testament' tab.",
      placement: "bottom",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "4px",
        },
      },
    },
    {
      target: "[data-tour-john]",
      content: "Click on 'John' to expand its chapters.",
      placement: "right",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "4px",
        },
      },
    },
    {
      target: '[data-tour-chapter="1"]',
      content: "Click on chapter 1.",
      placement: "right",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "4px",
        },
      },
    },
    {
      target: "body",
      content:
        "Perfect! You now know how to navigate VerseMate. Enjoy reading!",
      placement: "center",
    },
  ];

  // Mobile tour steps (basic informational)
  const mobileBasicSteps: Step[] = [
    {
      target: "body",
      content: "Welcome to VerseMate! Let's take a quick tour.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: '[data-tour="chapter-content"]',
      content:
        "This is where you read Bible verses. You can select text to highlight passages.",
      placement: "bottom",
    },
    {
      target: '[data-tour="mobile-book-selector"]',
      content: "Tap here to browse and select different books and chapters.",
      placement: "bottom",
    },
    {
      target: '[data-tour="action-buttons"]',
      content:
        "Quick actions: Bookmark chapters, add notes, copy or share passages.",
      placement: "bottom",
    },
    {
      target: '[data-tour="mobile-explanation-tab"]',
      content: "Tap this tab to view AI-powered explanations and commentary.",
      placement: "left", // Left placement to avoid extending page
    },
    {
      target: '[data-tour="mobile-menu-button"]',
      content: "Access your bookmarks, notes, highlights, and settings here.",
      placement: "left", // Left placement to avoid extending page
    },
  ];

  // Mobile guided tour steps (interactive)
  const mobileGuidedSteps: Step[] = [
    {
      target: "body",
      content:
        "Great! Now let's learn how to navigate between books. Tap Next to continue.",
      placement: "center",
      disableBeacon: true,
    },
    {
      target: '[data-tour="mobile-book-selector"]',
      content: "Tap on this book selector to open the navigation menu.",
      placement: "bottom",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "8px",
        },
      },
    },
    {
      target: '[data-tour="nt-tab"]',
      content: "Tap on 'New Testament' tab.",
      placement: "bottom",
      spotlightClicks: true,
      disableOverlay: false,
      ...(isSmallScreen && { spotlightPadding: 0 }),
      styles: {
        spotlight: {
          borderRadius: "4px",
          ...(isSmallScreen && { padding: "25px" }),
        },
      },
    },
    {
      target: "[data-tour-john]",
      content: "Tap on 'John' to expand its chapters.",
      placement: "bottom",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "4px",
        },
      },
    },
    {
      target: '[data-tour-chapter="1"]',
      content: "Tap on chapter 1.",
      placement: "bottom",
      spotlightClicks: true,
      disableOverlay: false,
      styles: {
        spotlight: {
          borderRadius: "4px",
        },
      },
    },
    {
      target: "body",
      content:
        "Perfect! You now know how to navigate VerseMate. Enjoy reading!",
      placement: "center",
    },
  ];

  const steps = isMobile
    ? showGuidedTour
      ? mobileGuidedSteps
      : mobileBasicSteps
    : showGuidedTour
      ? guidedSteps
      : basicSteps;

  useEffect(() => {
    if (run) {
      // Ensure mobile starts on the Bible tab at the very beginning
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        // Defer to next tick so MainContent mounts and subscribes to the event
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("setActiveTab", { detail: "book" }),
          );
        }, 100);
      }
      setTourRun(true);
      setStepIndex(0);
      setShowGuidedTour(false);
    }
  }, [run]);

  // Attach click handlers for guided tour steps
  useEffect(() => {
    const isMobileNow =
      typeof window !== "undefined" && window.innerWidth < 1024;
    if (!showGuidedTour || !tourRun) {
      return;
    }

    // Clean up any existing handler
    if (clickCleanupRef.current) {
      clickCleanupRef.current();
      clickCleanupRef.current = null;
    }

    // Attach delegated click handlers per step

    // Step 1: Book selector (different selectors for mobile vs desktop)
    if (stepIndex === 1) {
      const bookSelectorTarget = isMobileNow
        ? '[data-tour="mobile-book-selector"]'
        : '[data-tour="book-selector"]';

      attachDelegatedClick(bookSelectorTarget, () => {
        setTimeout(() => setStepIndex(2), isMobileNow ? 400 : 200);
      });
    }
    // Step 2: New Testament tab
    else if (stepIndex === 2) {
      attachDelegatedClick('[data-tour="nt-tab"]', () => {
        setTimeout(() => setStepIndex(3), isMobileNow ? 400 : 200);
      });
    }
    // Step 3: John book
    else if (stepIndex === 3) {
      attachDelegatedClick("[data-tour-john]", () => {
        setTimeout(() => setStepIndex(4), isMobileNow ? 400 : 200);
      });
    }
    // Step 4: Chapter 1
    else if (stepIndex === 4) {
      attachDelegatedClick('[data-tour-chapter="1"]', () => {
        setTimeout(() => setStepIndex(5), isMobileNow ? 400 : 200);
      });
    }

    return () => {
      if (clickCleanupRef.current) {
        clickCleanupRef.current();
        clickCleanupRef.current = null;
      }
    };
  }, [showGuidedTour, tourRun, stepIndex, attachDelegatedClick]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { status, type, index, action } = data;

      // Ensure mobile is on Bible tab at the start (works for basic and guided)
      if (
        (type === EVENTS.TOUR_START ||
          (type === EVENTS.STEP_BEFORE && index === 0)) &&
        typeof window !== "undefined" &&
        window.innerWidth < 1024
      ) {
        window.dispatchEvent(
          new CustomEvent("setActiveTab", { detail: "book" }),
        );
      }

      if (type === EVENTS.STEP_AFTER) {
        // For basic tour, allow Next/Back button navigation
        if (!showGuidedTour && (action === "next" || action === "prev")) {
          const nextIndex = index + (action === "prev" ? -1 : 1);
          setStepIndex(nextIndex);
        }
        // For guided tour step 0 (intro), allow Next button
        else if (showGuidedTour && index === 0 && action === "next") {
          setStepIndex(1);
        }
        // For guided tour last step (5), clicking "Finish Tour" should end the tour
        else if (showGuidedTour && index === 5 && action === "next") {
          setTourRun(false);
          setStepIndex(0);
          setShowGuidedTour(false);
          onComplete?.();
        }
      } else if (type === EVENTS.TARGET_NOT_FOUND) {
        return;
      } else if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        // Tour completed or skipped
        if (!showGuidedTour && status === STATUS.FINISHED) {
          // Just finished basic tour (mobile or desktop), start guided tour
          setTourRun(false);
          setTimeout(() => {
            setShowGuidedTour(true);
            setStepIndex(0);
            setTourRun(true);
          }, 300);
        } else {
          // Guided tour finished or any tour skipped
          setTourRun(false);
          setStepIndex(0);
          setShowGuidedTour(false);
          onComplete?.();
        }
      }
    },
    [showGuidedTour, onComplete],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clickCleanupRef.current) {
        clickCleanupRef.current();
      }
    };
  }, []);

  return (
    <Joyride
      steps={steps}
      run={tourRun}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      hideCloseButton={true}
      hideBackButton={showGuidedTour}
      disableCloseOnEsc={true}
      disableOverlayClose={true}
      disableScrolling={false}
      scrollToFirstStep={true}
      scrollOffset={200}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: "#1a365d",
          textColor: "#333",
          backgroundColor: "#fff",
          overlayColor: "rgba(0, 0, 0, 0.5)",
          arrowColor: "#fff",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: "8px",
          padding: "20px",
        },
        tooltipContainer: {
          textAlign: "left",
        },
        buttonNext: {
          display:
            !showGuidedTour || stepIndex === 0 || stepIndex === 5
              ? "inline-block"
              : "none",
          backgroundColor: "#1a365d",
          borderRadius: "6px",
          padding: "8px 16px",
        },
      }}
      locale={{
        back: "Back",
        close: "Close",
        last: "Finish Tour",
        next: "Next",
        skip: showGuidedTour ? "Skip Tutorial" : "Skip Tour",
      }}
    />
  );
};
