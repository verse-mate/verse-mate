import { useEffect, useRef } from "react";
import styles from "./word-definition.module.css";

interface WordDefinitionPopoverProps {
  word: string;
  position: { x: number; y: number };
  onClose: () => void;
}

interface WordDefinition {
  word: string;
  definition: string;
  transliteration?: string;
  strongsNumber?: string;
}

/**
 * WordDefinitionPopover - Show Greek/Hebrew word definitions
 * Phase 3.3 - Implemented
 * Features:
 * - Positioned near clicked word with viewport boundary detection
 * - Shows definition text with transliteration and Strong's number
 * - Close on click outside
 * - Uses mock data (no backend support yet)
 */
export function WordDefinitionPopover({
  word,
  position,
  onClose,
}: WordDefinitionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const definition = getWordDefinition(word);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!popoverRef.current) return;

    const rect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Adjust horizontal position if overflowing
    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 16;
    }
    if (adjustedX < 16) {
      adjustedX = 16;
    }

    // Adjust vertical position if overflowing
    if (rect.bottom > viewportHeight) {
      adjustedY = position.y - rect.height - 16;
    }
    if (adjustedY < 16) {
      adjustedY = 16;
    }

    popoverRef.current.style.left = `${adjustedX}px`;
    popoverRef.current.style.top = `${adjustedY}px`;
  }, [position]);

  if (!definition) {
    return (
      <div
        ref={popoverRef}
        className={styles.popover}
        style={{ left: position.x, top: position.y }}
      >
        <div className={styles.word}>{word}</div>
        <div className={styles.definition}>
          No definition available for this word.
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.word}>{definition.word}</div>
      {definition.transliteration && (
        <div className={styles.transliteration}>
          {definition.transliteration}
        </div>
      )}
      {definition.strongsNumber && (
        <div className={styles.strongsNumber}>{definition.strongsNumber}</div>
      )}
      <div className={styles.definition}>{definition.definition}</div>
      <button type="button" className={styles.closeButton} onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/**
 * Mock word definitions - to be replaced with real data
 */
export function getWordDefinition(word: string): WordDefinition | null {
  // Normalize word for lookup (case-insensitive, remove punctuation)
  const normalizedWord = word.toLowerCase().replace(/[^\w\s]/g, "");

  const mockDefinitions: Record<string, WordDefinition> = {
    beginning: {
      word: "beginning",
      definition:
        "The point in time or space at which something starts; the first part or earliest stage of something.",
      transliteration: "reshith",
      strongsNumber: "H7225",
    },
    god: {
      word: "God",
      definition:
        "The supreme being; the creator and ruler of the universe in monotheistic religions.",
      transliteration: "Elohim",
      strongsNumber: "H430",
    },
    created: {
      word: "created",
      definition: "To bring into existence; to make or produce something new.",
      transliteration: "bara",
      strongsNumber: "H1254",
    },
    heaven: {
      word: "heaven",
      definition:
        "The sky; the dwelling place of God; the realm of the divine.",
      transliteration: "shamayim",
      strongsNumber: "H8064",
    },
    earth: {
      word: "earth",
      definition:
        "The planet on which we live; the ground or soil; the world of human existence.",
      transliteration: "erets",
      strongsNumber: "H776",
    },
    word: {
      word: "Word",
      definition:
        "The divine expression; the Logos; God's communication and revelation.",
      transliteration: "logos",
      strongsNumber: "G3056",
    },
    love: {
      word: "love",
      definition:
        "Divine, unconditional love; the highest form of love that seeks the best for others.",
      transliteration: "agape",
      strongsNumber: "G26",
    },
  };

  return mockDefinitions[normalizedWord] || null;
}
