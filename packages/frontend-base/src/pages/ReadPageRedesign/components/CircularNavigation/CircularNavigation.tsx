/**
 * CircularNavigation - Circular arrow buttons for chapter navigation
 * Phase 3 - Left Panel Refactor
 *
 * Matches Figma design with circular buttons at bottom of left panel
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./circular-navigation.module.css";

interface CircularNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function CircularNavigation({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: CircularNavigationProps) {
  return (
    <div className={styles.navigation}>
      <button
        type="button"
        className={styles.navButton}
        onClick={onPrevious}
        disabled={!hasPrevious}
        title="Previous chapter"
      >
        <ChevronLeft size={20} />
      </button>

      <button
        type="button"
        className={styles.navButton}
        onClick={onNext}
        disabled={!hasNext}
        title="Next chapter"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
