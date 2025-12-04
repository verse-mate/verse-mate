import { type StrongsEntry, lookup } from "lexicon";
import { useEffect, useState } from "react";
import { Dialog } from "../Dialog";
import styles from "./DictionaryModal.module.css";

interface DictionaryModalProps {
  strongsNum: string;
  open: boolean;
  onClose: () => void;
}

export const DictionaryModal = ({
  strongsNum,
  open,
  onClose,
}: DictionaryModalProps) => {
  const [entry, setEntry] = useState<StrongsEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !strongsNum) return;

    setLoading(true);
    setError(null);

    lookup(strongsNum)
      .then((result) => {
        if (result.found && result.entry) {
          setEntry(result.entry);
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
  }, [strongsNum, open]);

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
          <p className={styles.errorHint}>
            The Strong's number "{strongsNum}" could not be found in the
            lexicon.
          </p>
        </div>
      );
    }

    return (
      <div className={styles.content}>
        {/* Main word display */}
        <div className={styles.wordHeader}>
          <h2 className={styles.lemma}>{entry.lemma}</h2>
          {entry.transliteration && (
            <p className={styles.transliteration}>{entry.transliteration}</p>
          )}
          <p className={styles.strongsId}>{entry.id}</p>
        </div>

        {/* Definition */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Definition</h3>
          <p className={styles.definition}>{entry.definition}</p>
        </div>

        {/* KJV Translation */}
        {entry.kjvTranslation && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              King James Version Translation
            </h3>
            <p className={styles.kjvTranslation}>{entry.kjvTranslation}</p>
          </div>
        )}

        {/* Derivation */}
        {entry.derivation && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Etymology & Derivation</h3>
            <p className={styles.derivation}>{entry.derivation}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      maxWidth="600px"
    >
      <Dialog.Head>
        {loading ? "Dictionary" : entry ? "Word Definition" : "Error"}
      </Dialog.Head>
      <Dialog.Content>{renderContent()}</Dialog.Content>
    </Dialog>
  );
};
