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
  const clickCleanupRef = useRef<(() => void) | null>(null);

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
      placement: "bottom",
    },
    {
      target: '[data-tour="chapter-content"]',
      content:
        "The main content displays Bible verses. Select text to highlight, bookmark, or add notes.",
      placement: "top",
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
    {
      target: '[data-tour="book-selector"]',
      content:
        "Browse and select books from Old Testament, New Testament, or Topics.",
      placement: "bottom",
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
      target: '.list-module__qLQ6aa__tabsList button[aria-controls*="NT"]',
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

  const steps = showGuidedTour ? guidedSteps : basicSteps;

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
    if (!showGuidedTour || !tourRun) return;

    // Clean up any existing handler
    if (clickCleanupRef.current) {
      clickCleanupRef.current();
      clickCleanupRef.current = null;
    }

    console.log(`Setting up click handler for step ${stepIndex}`);

    // Step 1: Book selector
    if (stepIndex === 1) {
      attachDelegatedClick('[data-tour="book-selector"]', () => {
        console.log("Book selector clicked, advancing to step 2");
        setTimeout(() => setStepIndex(2), 200);
      });
    }
    // Step 2: New Testament tab
    else if (stepIndex === 2) {
      attachDelegatedClick(
        '.list-module__qLQ6aa__tabsList button[aria-controls*="NT"]',
        () => {
          console.log("New Testament tab clicked, advancing to step 3");
          setTimeout(() => setStepIndex(3), 200);
        },
      );
    }
    // Step 3: John book
    else if (stepIndex === 3) {
      attachDelegatedClick("[data-tour-john]", () => {
        console.log("John book clicked, advancing to step 4");
        setTimeout(() => setStepIndex(4), 200);
      });
    }
    // Step 4: Chapter 1
    else if (stepIndex === 4) {
      attachDelegatedClick('[data-tour-chapter="1"]', () => {
        console.log("Chapter 1 clicked, advancing to step 5");
        setTimeout(() => setStepIndex(5), 200);
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
        // For other guided tour steps, clicks handle advancement (not Next/Back buttons)
      } else if (type === EVENTS.TARGET_NOT_FOUND) {
        // Don't auto-skip on target not found - wait for element to appear
        console.log(
          "Target not found for step",
          index,
          "- waiting for element",
        );
      } else if (status === STATUS.FINISHED) {
        // Tour completed
        if (!showGuidedTour) {
          // Just finished basic tour, start guided tour
          console.log("Basic tour finished, starting guided tour");
          setTourRun(false);
          setTimeout(() => {
            setShowGuidedTour(true);
            setStepIndex(0);
            setTourRun(true);
          }, 300);
        } else {
          // Guided tour finished
          console.log("Guided tour finished");
          setTourRun(false);
          setStepIndex(0);
          onComplete?.();
        }
      } else if (status === STATUS.SKIPPED) {
        // Tour skipped
        console.log("Tour skipped");
        setTourRun(false);
        setStepIndex(0);
        onComplete?.();
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
      // Hide Next/Back buttons for guided tour, show them for basic tour
      hideBackButton={showGuidedTour}
      disableCloseOnEsc={showGuidedTour}
      disableOverlayClose={showGuidedTour}
      disableScrolling={showGuidedTour} // Disable auto-scroll for guided tour
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
          // Show Next button for basic tour and guided tour step 0, hide for other guided steps
          display: showGuidedTour && stepIndex !== 0 ? "none" : "inline-block",
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
        last: "Finish",
        next: "Next",
        skip: showGuidedTour ? "Skip Tutorial" : "Skip Tour",
      }}
    />
  );
};
