import { type StrongsEntry, lookup } from "lexicon";
import { useEffect, useState } from "react";
import { AnalyticsEvent, analytics } from "../../analytics";
import styles from "./DictionaryPopover.module.css";

interface DictionaryPopoverProps {
  strongsNum: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export const DictionaryPopover = ({
  strongsNum,
  position,
  onClose,
}: DictionaryPopoverProps) => {
  const [entry, setEntry] = useState<StrongsEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    lookup(strongsNum)
      .then((result) => {
        if (result.found && result.entry) {
          setEntry(result.entry);

          // Track DICTIONARY_LOOKUP event on successful lookup
          analytics.track(AnalyticsEvent.DICTIONARY_LOOKUP, {
            word: result.entry.lemma || strongsNum,
            source: "strongs",
            strongsNumber: strongsNum,
          });
        } else {
          setError(result.error || "Word not found");
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load definition",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [strongsNum]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading definition...</p>
        </div>
      );
    }

    if (error || !entry) {
      return (
        <div className={styles.error}>
          <p>{error || "Definition not found"}</p>
        </div>
      );
    }

    return (
      <>
        <div className={styles.header}>
          <h4 id="dictionary-popover-title" className={styles.title}>
            {entry.lemma}
            {entry.transliteration && (
              <span className={styles.transliteration}>
                {" "}
                ({entry.transliteration})
              </span>
            )}
          </h4>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Strong's:</span>
            <span className={styles.value}>{entry.id}</span>
          </div>

          {entry.partOfSpeech && (
            <div className={styles.infoRow}>
              <span className={styles.label}>Part of Speech:</span>
              <span className={styles.value}>{entry.partOfSpeech}</span>
            </div>
          )}

          <div className={styles.definition}>
            <p>{entry.definition}</p>
            {entry.extendedDefinition && <p>{entry.extendedDefinition}</p>}
          </div>

          {entry.derivation && (
            <div className={styles.infoRow}>
              <span className={styles.label}>Origin:</span>
              <span className={styles.value}>{entry.derivation}</span>
            </div>
          )}

          {entry.kjvTranslation && (
            <div className={styles.infoRow}>
              <span className={styles.label}>KJV:</span>
              <span className={styles.value}>{entry.kjvTranslation}</span>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      {/* Backdrop to detect clicks outside */}
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="Close dictionary"
      />

      {/* Popover */}
      <div
        className={styles.popover}
        role="dialog"
        aria-labelledby="dictionary-popover-title"
        style={
          {
            "--popover-x": `${position.x}px`,
            "--popover-y": `${position.y}px`,
          } as React.CSSProperties
        }
      >
        {renderContent()}
      </div>
    </>
  );
};
