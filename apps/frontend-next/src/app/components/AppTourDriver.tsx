"use client";

import confetti from "canvas-confetti";
import { driver } from "driver.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "driver.js/dist/driver.css";
import "./AppTour.css";

interface AppTourProps {
  run?: boolean;
  onComplete?: () => void;
}

// Constants
const MOBILE_BREAKPOINT = 1024;
const TAB_SWITCH_DELAY = 100;
const TOUR_START_DELAY = 150;
const MOBILE_STEP_DELAY = 400;
const DESKTOP_STEP_DELAY = 200;
const ACCORDION_DELAY = 300;
const CLEANUP_DELAY = 100;
const TOUR_STORAGE_KEY = "vm_tour_completed";
const TOUR_ELEMENT_SELECTORS =
  "[data-tour], [data-tour-john], [data-tour-chapter]";
const INTERACTIVE_STEPS = [1, 2, 3, 4] as const;

export default function AppTourDriver({
  run = false,
  onComplete,
}: AppTourProps) {
  const isMobile = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.innerWidth < MOBILE_BREAKPOINT
        : false,
    [],
  );
  const drvRef = useRef<ReturnType<typeof driver> | null>(null);
  const eventGuardCleanupRef = useRef<(() => void) | null>(null);
  const [guidedActive, setGuidedActive] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);

  // Delegated click helper - lets click through, just observes and advances tour
  const attachDelegatedClick = useCallback(
    (selector: string, onMatch: (el: HTMLElement, e: Event) => void) => {
      const handler = (e: Event) => {
        const node = e.target as HTMLElement | null;
        const matched = node?.closest?.(selector) as HTMLElement | null;
        if (matched) {
          // Don't prevent default - let the click work normally
          // Just call our handler to advance the tour
          onMatch(matched, e);
        }
      };
      // Use capture phase to detect click before it bubbles
      document.addEventListener("click", handler, true);
      return () => document.removeEventListener("click", handler, true);
    },
    [],
  );

  useEffect(() => {
    if (!run) return;

    // Utility: Reset pointer-events on all tour elements
    const resetTourElementPointers = () => {
      document.querySelectorAll(TOUR_ELEMENT_SELECTORS).forEach((el) => {
        (el as HTMLElement).style.pointerEvents = "";
      });
    };

    // Utility: Clean up driver.js DOM elements
    const cleanupDriverElements = () => {
      document.querySelector(".driver-overlay")?.remove();
      document.querySelector(".driver-popover")?.remove();
      document.querySelectorAll(".driver-active-element").forEach((el) => {
        el.classList.remove("driver-active-element");
      });
      document.body.classList.remove("tour-active");
    };

    // Add body class to disable tour-related scrolling
    document.body.classList.add("tour-active");

    // Ensure mobile starts on Bible tab (with delay to ensure component is ready)
    if (typeof window !== "undefined" && isMobile) {
      setTimeout(() => {
        try {
          window.dispatchEvent(
            new CustomEvent("setActiveTab", { detail: "book" }),
          );
        } catch {}
      }, TAB_SWITCH_DELAY);
    }

    // Confetti celebration effect
    const celebrate = () => {
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      // Bigger confetti on desktop
      const scalar = isMobile ? 1 : 2;
      const defaults = {
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 10001,
        scalar,
      };

      const randomInRange = (min: number, max: number) =>
        Math.random() * (max - min) + min;

      const interval = window.setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        // Fire from left side
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });

        // Fire from right side
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);
    };

    // Track if user clicked skip
    let userSkipped = false;

    // Create skip button manually
    const addSkipButton = (
      popover: { wrapper: HTMLElement },
      isInteractive: boolean,
    ) => {
      const footer = popover.wrapper.querySelector(".driver-popover-footer");
      if (!footer) return;

      // Check if already exists
      if (footer.querySelector(".skip-tour-btn")) return;

      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = `skip-tour-btn ${isInteractive ? "skip-interactive" : "skip-default"}`;
      skipBtn.textContent = "Skip Tutorial";

      // Add handler that skips all tours
      skipBtn.onclick = (e) => {
        e.stopPropagation();
        userSkipped = true;
        try {
          localStorage.setItem(TOUR_STORAGE_KEY, "1");
        } catch {}
        const activeDriver = drvRef.current;
        if (activeDriver) {
          (activeDriver as any).destroy();
        }
      };

      if (isInteractive) {
        footer.appendChild(skipBtn);
      } else {
        const progress = footer.querySelector(".driver-popover-progress-text");
        footer.insertBefore(
          skipBtn,
          progress?.nextSibling || footer.firstChild,
        );
      }
    };

    // Common options and styling; popover centering handled via CSS override
    const commonOpts = {
      showProgress: true,
      allowClose: false, // Disable to prevent accidental closes
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish Tour",
      stagePadding: 4,
      overlayColor: "rgba(0, 0, 0, 0.5)",
      smoothScroll: true,
      popoverClass: "vm-tour-popover",
    } as const;

    const desktopBasic = [
      {
        popover: {
          title: "Welcome to VerseMate!",
          description: "Let's take a quick tour of the main features.",
          side: "center",
          align: "center",
        },
      },
      {
        element: '[data-tour="chapter-title"]',
        popover: {
          description: "This shows the current book and chapter we're reading.",
          side: "top",
          align: "center",
        },
      },
      {
        element: '[data-tour="chapter-content"]',
        popover: {
          description:
            "The main content displays Bible verses. Select text to highlight, bookmark, or add notes.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="book-selector"]',
        popover: {
          description:
            "This is where we select books. Choose from Old Testament, New Testament, or Topics.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="action-buttons"]',
        popover: {
          description:
            "Quick actions: Bookmark chapters, add notes, copy or share passages.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="explanation-types-desktop"]',
        popover: {
          description:
            "Choose AI explanation types: Summary, By Line, or Detailed commentary.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="menu-button-desktop"]',
        popover: {
          description:
            "Open the menu to log in and access your bookmarks, notes, highlights, and settings.",
          side: "left",
          align: "start",
        },
      },
      {
        popover: {
          description:
            "Perfect! We now know how to navigate VerseMate. Enjoy reading!",
          side: "center",
          align: "center",
        },
      },
    ];

    const mobileBasic = [
      {
        popover: {
          title: "Welcome to VerseMate!",
          description: "Let's take a tour of the main features.",
          side: "center",
          align: "center",
        },
      },
      {
        element: '[data-tour="chapter-content"]',
        popover: {
          description:
            "This is where we read Bible verses. We can select text to highlight passages.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="mobile-book-selector"]',
        popover: {
          description: "This is where we select books and chapters.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="action-buttons"]',
        popover: {
          description:
            "Quick actions: Bookmark chapters, add notes, copy or share passages.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="mobile-explanation-tab"]',
        popover: {
          description:
            "This is where we view AI-powered explanations and commentary.",
          side: "left",
          align: "center",
        },
      },
      {
        element: '[data-tour="mobile-menu-button"]',
        popover: {
          description:
            "Access our bookmarks, notes, highlights, and settings here.",
          side: "left",
          align: "center",
        },
      },
      {
        popover: {
          description:
            "Perfect! We now know how to navigate VerseMate. Enjoy reading!",
          side: "center",
          align: "center",
        },
      },
    ];

    const startBasic = () => {
      drvRef.current?.destroy?.();
      const basicSteps = (isMobile ? mobileBasic : desktopBasic) as any;

      // Handle keyboard navigation for basic tour
      const basicKeyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          drv.moveNext();
        }
      };
      window.addEventListener("keydown", basicKeyHandler);

      const drv = driver({
        ...commonOpts,
        steps: basicSteps,
        onPopoverRender: (popover) => {
          addSkipButton(popover, false);
        },
        // Disable spotlight clicks on basic tour
        onHighlightStarted: () => {
          const activeIdx = drv.getActiveIndex();
          // Trigger confetti on last step
          if (activeIdx === basicSteps.length - 1) {
            celebrate();
          }
          // Disable clicks on the highlighted element
          const spotlight = document.querySelector(
            ".driver-active-element",
          ) as HTMLElement;
          if (spotlight) {
            spotlight.style.pointerEvents = "none";
          }
          // Block clicks through the overlay but allow popover interactions
          const overlay = document.querySelector(
            ".driver-overlay",
          ) as HTMLElement;
          if (overlay) {
            overlay.style.pointerEvents = "auto";
          }
          // Ensure popover and its buttons allow pointer events
          const popover = document.querySelector(
            ".driver-popover",
          ) as HTMLElement;
          if (popover) {
            popover.style.pointerEvents = "auto";
          }
        },
        onDestroyStarted: () => {
          // Clean up keyboard handler
          window.removeEventListener("keydown", basicKeyHandler);

          // Clean up overlay pointer events
          const overlay = document.querySelector(
            ".driver-overlay",
          ) as HTMLElement;
          if (overlay) {
            overlay.style.pointerEvents = "";
          }

          resetTourElementPointers();

          if (userSkipped) {
            onComplete?.();
          } else {
            setTimeout(() => startGuided(), DESKTOP_STEP_DELAY);
          }
        },
      });
      drvRef.current = drv;
      drv.drive();
    };

    const startGuided = () => {
      setGuidedActive(true);
      setGuidedStepIndex(0);

      const steps = (
        isMobile
          ? [
              {
                popover: {
                  description:
                    "Great! Now let's learn how to navigate between books. Tap Next to continue.",
                  side: "center",
                  align: "center",
                },
              },
              {
                element: '[data-tour="mobile-book-selector"]',
                popover: {
                  description: "Tap the book selector to open the menu.",
                  side: "bottom",
                  align: "center",
                },
              },
              {
                element: '[data-tour="nt-tab"]',
                popover: {
                  description:
                    "This is where we choose between Old/New Testament books or Topics. Let's start with the New Testament.",
                  side: "bottom",
                  align: "center",
                },
              },
              {
                element: "[data-tour-john]",
                popover: {
                  description: "Tap 'John' to expand its chapters.",
                  side: "bottom",
                  align: "center",
                },
              },
              {
                element: '[data-tour-chapter="1"]',
                popover: {
                  description: "Tap Chapter 1.",
                  side: "bottom",
                  align: "center",
                },
              },
              {
                popover: {
                  description:
                    "Perfect! We now know how to navigate VerseMate. Enjoy reading!",
                  side: "center",
                  align: "center",
                },
              },
            ]
          : [
              {
                popover: {
                  description:
                    "Great! Now let's learn how to navigate between books. Click Next to continue.",
                  side: "center",
                  align: "center",
                },
              },
              {
                element: '[data-tour="book-selector"]',
                popover: {
                  description: "Click the book selector to open the menu.",
                  side: "bottom",
                  align: "center",
                },
              },
              {
                element: '[data-tour="nt-tab"]',
                popover: {
                  description:
                    "This is where we choose between Old/New Testament books or Topics. Let's start with the New Testament.",
                  side: "bottom",
                  align: "center",
                },
              },
              {
                element: "[data-tour-john]",
                popover: {
                  description: "Click 'John' to expand its chapters.",
                  side: "right",
                  align: "center",
                },
              },
              {
                element: '[data-tour-chapter="1"]',
                popover: {
                  description: "Click Chapter 1.",
                  side: "right",
                  align: "center",
                },
              },
              {
                popover: {
                  description:
                    "Perfect! We now know how to navigate VerseMate. Enjoy reading!",
                  side: "center",
                  align: "center",
                },
              },
            ]
      ) as any;

      drvRef.current?.destroy?.();

      // Click-to-advance handlers per step - guarded by step index
      const cleanups: Array<() => void> = [];
      let currentStepIdx = 0;
      let isAdvancing = false; // Prevent double-advance

      // Handle keyboard navigation for guided tour
      const guidedKeyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          // Only allow keyboard advance on non-interactive steps (0 and 5)
          if (currentStepIdx === 0 || currentStepIdx === 5) {
            e.preventDefault();
            drvG.moveNext();
          }
        }
      };
      window.addEventListener("keydown", guidedKeyHandler);

      const drvG = driver({
        ...commonOpts,
        steps,
        onPopoverRender: (popover) => {
          const activeIdx = drvG.getActiveIndex();
          const isInteractiveStep =
            activeIdx !== null &&
            activeIdx !== undefined &&
            activeIdx >= 1 &&
            activeIdx <= 4;

          addSkipButton(popover, isInteractiveStep);

          // Hide back/next buttons during interactive steps (1-4)
          if (isInteractiveStep) {
            const footer = popover.wrapper.querySelector(
              ".driver-popover-footer",
            );
            const prevBtn = footer?.querySelector(".driver-popover-prev-btn");
            const nextBtn = footer?.querySelector(".driver-popover-next-btn");
            if (prevBtn) (prevBtn as HTMLElement).style.display = "none";
            if (nextBtn) (nextBtn as HTMLElement).style.display = "none";
          }
        },
        onHighlightStarted: () => {
          const activeIdx = drvG.getActiveIndex();
          if (activeIdx !== null && activeIdx !== undefined) {
            currentStepIdx = activeIdx;
            setGuidedStepIndex(activeIdx);
            isAdvancing = false; // Reset when new step starts
            // Trigger confetti on last step
            if (activeIdx === steps.length - 1) {
              celebrate();
            }
          }
        },
        onDestroyStarted: () => {
          // Clean up keyboard handler
          window.removeEventListener("keydown", guidedKeyHandler);

          if (!userSkipped) {
            try {
              localStorage.setItem(TOUR_STORAGE_KEY, "1");
            } catch {}
          }
          userSkipped = false;
          // Immediately cleanup event guards
          eventGuardCleanupRef.current?.();
          eventGuardCleanupRef.current = null;
          setGuidedActive(false);
          setGuidedStepIndex(0);

          // Clean up any lingering driver.js elements and reset styles
          setTimeout(() => {
            cleanupDriverElements();
            resetTourElementPointers();
          }, CLEANUP_DELAY);

          onComplete?.();
        },
      });
      drvRef.current = drvG;
      drvG.drive();

      // Step 1: open selector
      cleanups.push(
        attachDelegatedClick(
          isMobile
            ? '[data-tour="mobile-book-selector"]'
            : '[data-tour="book-selector"]',
          (_el, _e) => {
            if (currentStepIdx === 1 && !isAdvancing) {
              isAdvancing = true;
              setTimeout(
                () => {
                  if (currentStepIdx === 1) {
                    // Double-check we're still on step 1
                    drvG.moveNext();
                  }
                },
                isMobile ? MOBILE_STEP_DELAY : DESKTOP_STEP_DELAY,
              );
            }
          },
        ),
      );
      // Step 2: NT tab
      cleanups.push(
        attachDelegatedClick('[data-tour="nt-tab"]', (_el, _e) => {
          if (currentStepIdx === 2 && !isAdvancing) {
            isAdvancing = true;
            setTimeout(
              () => {
                if (currentStepIdx === 2) {
                  drvG.moveNext();
                }
              },
              isMobile ? MOBILE_STEP_DELAY : DESKTOP_STEP_DELAY,
            );
          }
        }),
      );
      // Step 3: John - no scroll handling needed, tour-active class disables it
      cleanups.push(
        attachDelegatedClick("[data-tour-john]", (_el, _e) => {
          if (currentStepIdx === 3 && !isAdvancing) {
            isAdvancing = true;
            // Short delay for accordion animation
            setTimeout(() => {
              if (currentStepIdx === 3) {
                drvG.moveNext();
              }
            }, ACCORDION_DELAY);
          }
        }),
      );
      // Step 4: Chapter 1
      cleanups.push(
        attachDelegatedClick('[data-tour-chapter="1"]', (_el, _e) => {
          if (currentStepIdx === 4 && !isAdvancing) {
            isAdvancing = true;
            setTimeout(
              () => {
                if (currentStepIdx === 4) {
                  drvG.moveNext();
                }
              },
              isMobile ? MOBILE_STEP_DELAY : DESKTOP_STEP_DELAY,
            );
          }
        }),
      );

      // Cleanup handlers when guided ends
      const detach = () => {
        cleanups.forEach((fn) => fn());
      };
      // Try to detach on teardown as well
      (drvG as any)._vmDetach = detach;
    };

    // Start tour after tab is set on mobile
    if (isMobile) {
      setTimeout(() => startBasic(), TOUR_START_DELAY);
    } else {
      startBasic();
    }

    return () => {
      try {
        const d = drvRef.current as any;
        d?._vmDetach?.();
        drvRef.current?.destroy?.();
        document.body.classList.remove("tour-active");
        // Cleanup event guards
        eventGuardCleanupRef.current?.();
        eventGuardCleanupRef.current = null;
        // Remove any lingering driver.js elements and reset styles
        setTimeout(() => {
          cleanupDriverElements();
          resetTourElementPointers();
        }, CLEANUP_DELAY);
      } catch {}
    };
  }, [run, isMobile, onComplete, attachDelegatedClick]);

  // Guard outside clicks during guided interactive steps to keep dropdown open
  useEffect(() => {
    if (!guidedActive) return;
    if (
      !INTERACTIVE_STEPS.includes(
        guidedStepIndex as (typeof INTERACTIVE_STEPS)[number],
      )
    )
      return;

    const allowedForStep =
      guidedStepIndex === 1
        ? [
            isMobile
              ? '[data-tour="mobile-book-selector"]'
              : '[data-tour="book-selector"]',
          ]
        : guidedStepIndex === 2
          ? ['[data-tour="nt-tab"]']
          : guidedStepIndex === 3
            ? ["[data-tour-john]"]
            : ["[data-tour-chapter]"];

    const alwaysAllowed = [
      '[class*="grouped-content"]',
      '[class*="bookContent"]',
      ".driver-active-element",
      ".driver-active-element *",
      '[class*="driver-popover"] button',
    ];

    const guard = (e: Event) => {
      const node = e.target as HTMLElement | null;
      const isAllowed = [...allowedForStep, ...alwaysAllowed].some((sel) =>
        node?.closest?.(sel),
      );
      if (!isAllowed) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    // Handle keyboard during interactive steps (1-4)
    // Note: This useEffect only runs for steps 1-4 due to early return above
    const keyGuard = (e: KeyboardEvent) => {
      // Block Escape to prevent dropdown close
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      // Block Enter/Space to prevent accidental advancement
      // User must click the actual target element
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Only block pointer/mouse/touch events to preserve keyboard accessibility
    const eventNames: Array<keyof DocumentEventMap> = [
      "pointerdown",
      "mousedown",
      "touchstart",
      "click",
    ];

    const overlay = document.querySelector(
      ".driver-overlay",
    ) as HTMLElement | null;
    eventNames.forEach((evt) => {
      window.addEventListener(evt as any, guard, true);
      document.addEventListener(evt as any, guard, true);
      overlay?.addEventListener(evt as any, guard, true);
    });

    // Add keyboard event listener on window only (not on document to avoid double-firing)
    window.addEventListener("keydown", keyGuard, true);

    const cleanup = () => {
      eventNames.forEach((evt) => {
        window.removeEventListener(evt as any, guard, true);
        document.removeEventListener(evt as any, guard, true);
        overlay?.removeEventListener(evt as any, guard, true);
      });
      window.removeEventListener("keydown", keyGuard, true);
    };

    // Store cleanup for explicit calling
    eventGuardCleanupRef.current = cleanup;

    return cleanup;
  }, [guidedActive, guidedStepIndex, isMobile]);

  // Step-specific modal narrowing on mobile guided step 2
  useEffect(() => {
    const isMobileNow =
      typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
    if (guidedActive && isMobileNow && guidedStepIndex === 2) {
      document.body.classList.add("tour-narrow-modal");
    } else {
      document.body.classList.remove("tour-narrow-modal");
    }
    return () => {
      document.body.classList.remove("tour-narrow-modal");
    };
  }, [guidedActive, guidedStepIndex]);

  return null;
}
