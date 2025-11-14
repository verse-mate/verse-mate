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
          console.log(`Matched selector: ${selector}`);
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
      ...(isSmallScreen && { spotlightPadding: 0 }), // Only apply custom padding on small screens
      styles: {
        spotlight: {
          borderRadius: "4px",
          ...(isSmallScreen && { padding: "25px" }), // Custom padding only for screens ≤400px
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
      setTourRun(true);
      setStepIndex(0);
      setShowGuidedTour(false);
    }
  }, [run]);

  // Debug: Log when showGuidedTour changes
  useEffect(() => {
    console.log(
      "Tour mode changed:",
      showGuidedTour ? "GUIDED" : "BASIC",
      "Steps count:",
      steps.length,
    );
  }, [showGuidedTour, steps.length]);

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

    console.log(`Setting up click handler for step ${stepIndex}`);

    // Step 1: Book selector (different selectors for mobile vs desktop)
    if (stepIndex === 1) {
      const bookSelectorTarget = isMobileNow
        ? '[data-tour="mobile-book-selector"]'
        : '[data-tour="book-selector"]';

      attachDelegatedClick(bookSelectorTarget, () => {
        console.log("Book selector clicked, advancing to step 2");
        setTimeout(() => setStepIndex(2), isMobileNow ? 600 : 400);
      });
    }
    // Step 2: New Testament tab
    else if (stepIndex === 2) {
      console.log(
        "Attaching NT tab handler, checking element exists:",
        document.querySelector('[data-tour="nt-tab"]'),
      );
      attachDelegatedClick('[data-tour="nt-tab"]', (el) => {
        console.log("New Testament tab clicked!", el);
        console.log("Element details:", {
          tag: el.tagName,
          classes: el.className,
          dataTour: el.getAttribute("data-tour"),
        });
        // Longer delay on mobile to allow book list to render
        setTimeout(() => setStepIndex(3), isMobileNow ? 800 : 500);
      });
    }
    // Step 3: John book
    else if (stepIndex === 3) {
      attachDelegatedClick("[data-tour-john]", () => {
        console.log("John book clicked, advancing to step 4");
        setTimeout(() => setStepIndex(4), isMobileNow ? 600 : 400);
      });
    }
    // Step 4: Chapter 1
    else if (stepIndex === 4) {
      attachDelegatedClick('[data-tour-chapter="1"]', () => {
        console.log("Chapter 1 clicked, advancing to step 5");
        setTimeout(() => setStepIndex(5), isMobileNow ? 600 : 400);
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

      console.log("Joyride callback:", {
        status,
        type,
        index,
        action,
        currentStep: stepIndex,
      });

      if (type === EVENTS.STEP_AFTER) {
        // For basic tour, allow Next/Back button navigation
        if (!showGuidedTour && (action === "next" || action === "prev")) {
          const nextIndex = index + (action === "prev" ? -1 : 1);
          console.log(
            "Basic tour: Moving from step",
            index,
            "to step",
            nextIndex,
          );
          setStepIndex(nextIndex);
        }
        // For guided tour step 0 (intro), allow Next button
        else if (showGuidedTour && index === 0 && action === "next") {
          console.log("Guided tour: Moving from intro to step 1");
          setStepIndex(1);
        }
        // For guided tour last step (5), clicking "Finish Tour" should end the tour
        else if (showGuidedTour && index === 5 && action === "next") {
          console.log("Guided tour: Finish Tour clicked");
          setTourRun(false);
          setStepIndex(0);
          setShowGuidedTour(false);
          onComplete?.();
        }
        // For other guided tour steps, clicks handle advancement (not Next/Back buttons)
      } else if (type === EVENTS.TARGET_NOT_FOUND) {
        // Don't auto-skip on target not found - wait for element to appear
        console.log(
          "Target not found for step",
          index,
          "- waiting for element. Will retry automatically.",
        );
        // Joyride will automatically retry finding the target
        return;
      } else if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        // Tour completed or skipped
        if (!showGuidedTour && status === STATUS.FINISHED) {
          // Just finished basic tour (mobile or desktop), start guided tour
          console.log("Basic tour finished, starting guided tour");
          setTourRun(false);
          setTimeout(() => {
            setShowGuidedTour(true);
            setStepIndex(0);
            setTourRun(true);
          }, 300);
        } else {
          // Guided tour finished or any tour skipped
          console.log(
            status === STATUS.FINISHED
              ? "Guided tour finished"
              : "Tour skipped",
          );
          setTourRun(false);
          setStepIndex(0);
          setShowGuidedTour(false);
          onComplete?.();
        }
      }
    },
    [showGuidedTour, stepIndex, onComplete],
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
      // Hide back button for guided tour (mobile or desktop), show for basic tour
      hideBackButton={showGuidedTour}
      disableCloseOnEsc={true} // Prevent closing with ESC on both tours
      disableOverlayClose={true} // Prevent clicking outside on both tours
      disableScrolling={false} // Always allow scrolling for proper positioning
      scrollToFirstStep={true}
      scrollOffset={200} // Larger offset to account for scrollable containers
      callback={handleJoyrideCallback}
      floaterProps={{
        disableAnimation: false,
        styles: {
          floater: {
            zIndex: 10100,
          },
        },
      }}
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
          // Show Next button for:
          // - Basic tour (mobile or desktop) - always
          // - Guided tour step 0 and 5 (intro and completion) - mobile or desktop
          // Hide for guided tour steps 1-4 (interactive click-to-advance)
          display:
            !showGuidedTour || stepIndex === 0 || stepIndex === 5
              ? "inline-block"
              : "none",
          backgroundColor: "#1a365d",
          borderRadius: "6px",
          padding: "8px 16px",
        },
        buttonBack: {
          color: "#666",
          marginRight: "10px",
        },
        buttonSkip: {
          color: "#999",
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
