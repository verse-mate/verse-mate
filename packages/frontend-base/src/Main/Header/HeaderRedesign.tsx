import { Menu, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { BookSelector } from "../../pages/ReadPageRedesign/components/BookSelector";
import type { ViewMode } from "../../pages/ReadPageRedesign/types/view-mode";
import styles from "./header-redesign.module.css";

type ThemeMode = "light" | "dark" | "auto";

interface HeaderRedesignProps {
  currentBook?: string;
  currentChapter?: number;
  currentVersion?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onBookChange?: (book: string) => void;
  onChapterChange?: (chapter: number) => void;
  onVersionChange?: (version: string) => void;
  onThemeChange?: (theme: ThemeMode) => void;
  className?: string;
}

/**
 * HeaderRedesign - New header with book/chapter selector and theme toggle
 * Phase 2.3 - Implemented
 * Features:
 * - Book/Chapter/Version selectors (placeholders for now)
 * - Theme toggle (light/dark/auto)
 * - Logo and branding
 */
export function HeaderRedesign({
  currentBook = "Genesis",
  currentChapter = 1,
  viewMode = "summary",
  onViewModeChange,
  onBookChange,
  onThemeChange,
  className,
}: HeaderRedesignProps) {
  const [theme, setTheme] = useState<ThemeMode>("auto");

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    onThemeChange?.(newTheme);

    // Apply theme to document
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
    } else if (newTheme === "light") {
      root.classList.remove("dark");
    } else {
      // Auto mode - detect system preference
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  };

  return (
    <header className={`${styles.header} ${className || ""}`}>
      <div className={styles.container}>
        {/* Left: Logo and Book Selector */}
        <div className={styles.leftSection}>
          <div className={styles.logo}>VerseMate</div>

          <BookSelector
            bookName={currentBook}
            chapter={currentChapter}
            onClick={() => onBookChange?.(currentBook)}
          />
        </div>

        {/* Right: View Mode Toggle + Theme Toggle + Hamburger */}
        <div className={styles.rightSection}>
          {/* View Mode Toggle */}
          <div className={styles.viewModeToggle}>
            <button
              type="button"
              className={`${styles.viewModeButton} ${viewMode === "summary" ? styles.active : ""}`}
              onClick={() => onViewModeChange?.("summary")}
            >
              Summary
            </button>
            <button
              type="button"
              className={`${styles.viewModeButton} ${viewMode === "by-line" ? styles.active : ""}`}
              onClick={() => onViewModeChange?.("by-line")}
            >
              By Line
            </button>
            <button
              type="button"
              className={`${styles.viewModeButton} ${viewMode === "detailed" ? styles.active : ""}`}
              onClick={() => onViewModeChange?.("detailed")}
            >
              Detailed
            </button>
          </div>

          {/* Theme Toggle */}
          <div className={styles.themeToggle}>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "light" ? styles.active : ""}`}
              onClick={() => handleThemeChange("light")}
              title="Light theme"
            >
              <Sun size={18} />
            </button>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "auto" ? styles.active : ""}`}
              onClick={() => handleThemeChange("auto")}
              title="Auto theme"
            >
              <Monitor size={18} />
            </button>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "dark" ? styles.active : ""}`}
              onClick={() => handleThemeChange("dark")}
              title="Dark theme"
            >
              <Moon size={18} />
            </button>
          </div>

          {/* Hamburger Menu Button - Placeholder */}
          <button
            type="button"
            className={styles.hamburgerButton}
            title="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
