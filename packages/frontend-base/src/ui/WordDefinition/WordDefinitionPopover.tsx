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
 * TODO: Implement in Phase 3.3
 * Features:
 * - Positioned near clicked word
 * - Shows definition text
 * - Close on click outside
 * - Uses mock data (no backend support yet)
 */
export function WordDefinitionPopover({
  word,
  position,
  onClose,
}: WordDefinitionPopoverProps) {
  // Placeholder implementation - will be replaced in Phase 3.3
  return (
    <div
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        background: "var(--popover)",
        border: "1px solid var(--border-primary)",
        borderRadius: "8px",
        padding: "1rem",
        boxShadow: "var(--shadow-lg)",
        maxWidth: "300px",
        zIndex: 1000,
      }}
    >
      <div>
        <strong>{word}</strong>
      </div>
      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "0.875rem",
          color: "var(--text-secondary)",
        }}
      >
        Definition placeholder
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: "0.5rem",
          padding: "0.25rem 0.5rem",
          fontSize: "0.75rem",
        }}
      >
        Close
      </button>
    </div>
  );
}

/**
 * Mock word definitions - to be replaced with real data
 */
export function getWordDefinition(word: string): WordDefinition | null {
  // Placeholder - will add real mock data in Phase 3.3
  const mockDefinitions: Record<string, WordDefinition> = {
    beginning: {
      word: "beginning",
      definition: "The start or commencement of something",
      transliteration: "reshith",
      strongsNumber: "H7225",
    },
    God: {
      word: "God",
      definition: "The supreme being; deity",
      transliteration: "Elohim",
      strongsNumber: "H430",
    },
  };

  return mockDefinitions[word] || null;
}
