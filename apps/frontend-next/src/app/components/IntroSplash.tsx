"use client";

import { useEffect, useMemo, useState } from "react";
import "./IntroSplash.css";

interface IntroSplashProps {
  open: boolean;
  onClose: () => void;
}

const INTRO_STORAGE_KEY = "vm_intro_completed_v1";

const introScreens: Array<{
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  primaryCta: string;
  image?: string;
  mobileImage?: string;
}> = [
  {
    title: "Welcome to VerseMate",
    subtitle: "A smarter way to read, understand, and live the Bible.",
    body: "VerseMate helps you explore Scripture with clarity and depth, bringing historical context, original-language meaning, and thoughtful insights to every verse.",
    primaryCta: "Continue",
    image: "/assets/splashScreens/Desktop-Splash-1.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-1.png",
  },
  {
    title: "Book Introductions",
    body: "For each book of the Bible, VerseMate gives you a concise introduction so you know what you're reading and why it matters.",
    bullets: [
      "Author & date – who wrote it and when",
      "The book's role – where it fits in the Scripture",
      "Key themes & keywords",
      "Related books – how this book connects to the rest of the Bible",
    ],
    primaryCta: "Next",
    image: "/assets/splashScreens/Desktop-Spalsh-2.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-2.png",
  },
  {
    title: "Explore Any Book. Any Verse.",
    body: "Tap any verse to unlock deeper insight. Tap any word to see its original Hebrew or Greek meaning, pronunciation, and usage.",
    primaryCta: "Next",
    image: "/assets/splashScreens/Desktop-Splash-3.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-3.png",
  },
  {
    title: "Understand Scripture at Every Level",
    body: "Choose how deep you want to go:",
    bullets: [
      "Summary – quick understanding",
      "Line by Line – verse-by-verse clarity",
      "Detailed – rich historical and theological depth",
    ],
    primaryCta: "Next",
    image: "/assets/splashScreens/Desktop-Splash-4.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-4.png",
  },
  {
    title: "Explore the Bigger Story",
    body: "Discover insights across Scripture:",
    bullets: [
      "Key biblical events",
      "Jesus' parables",
      "Core themes and doctrines",
      "People, places, and timelines",
    ],
    primaryCta: "Next",
    image: "/assets/splashScreens/Desktop-Splash-5.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-5.png",
  },
  {
    title: "Make It Personal. Share It Forward.",
    bullets: [
      "Highlight verses",
      "Take personal notes",
      "Share Scripture and insights with the people you love",
    ],
    primaryCta: "Next",
    image: "/assets/splashScreens/Desktop-Splash-6.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-6.png",
  },
  {
    title: "Built for Everyone, Everywhere",
    body: "VerseMate is available in many languages and will always be free for anyone around the world.",
    primaryCta: "Start Reading",
    image: "/assets/splashScreens/Desktop-Splash-7.png",
    mobileImage: "/assets/splashScreens/Mobile-Splash-7.png",
  },
];

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  if (typeof navigator === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function IntroSplash({ open, onClose }: IntroSplashProps) {
  const [step, setStep] = useState(0);

  const isLastStep = useMemo(() => step >= introScreens.length - 1, [step]);

  useEffect(() => {
    if (!open) return;
    if (!isMobileDevice()) return;
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate?.(10);
      }
    } catch {}
  }, [open]);

  if (!open) return null;

  const screen = introScreens[step] ?? introScreens[introScreens.length - 1];

  const handleAdvance = () => {
    if (isLastStep) {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
        }
      } catch {}
      onClose();
      return;
    }
    setStep((prev) => Math.min(prev + 1, introScreens.length - 1));
  };

  const handleSkip = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
      }
    } catch {}
    onClose();
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="intro-splash-overlay">
      <div className="intro-splash-backdrop" />
      <div className="intro-splash-card" role="dialog" aria-modal="true">
        <button
          type="button"
          className="intro-splash-skip"
          onClick={handleSkip}
        >
          Skip
        </button>

        <div className="intro-splash-content">
          {(screen.image || screen.mobileImage) && (
            <div className="intro-splash-visual">
              <picture>
                {screen.image && (
                  <source srcSet={screen.image} media="(min-width: 1024px)" />
                )}
                <img
                  src={screen.mobileImage ?? screen.image ?? ""}
                  alt=""
                  className="intro-splash-image"
                />
              </picture>
            </div>
          )}
          <h1 className="intro-splash-title">{screen.title}</h1>
          {screen.subtitle && (
            <p className="intro-splash-subtitle">{screen.subtitle}</p>
          )}
          {screen.body && <p className="intro-splash-body">{screen.body}</p>}
          {screen.bullets && (
            <ul className="intro-splash-list">
              {screen.bullets.map((item) => (
                <li key={item} className="intro-splash-list-item">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="intro-splash-footer">
          <div className="intro-splash-dots" aria-hidden="true">
            {introScreens.map((screenDef, index) => (
              <span
                key={screenDef.title}
                className={
                  index === step
                    ? "intro-splash-dot intro-splash-dot-active"
                    : "intro-splash-dot"
                }
              />
            ))}
          </div>

          <div className="intro-splash-actions">
            <button
              type="button"
              className="intro-splash-back"
              onClick={handleBack}
              disabled={step === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="intro-splash-primary"
              onClick={handleAdvance}
            >
              {screen.primaryCta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function shouldShowIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(INTRO_STORAGE_KEY);
    return stored !== "1";
  } catch {
    return false;
  }
}
