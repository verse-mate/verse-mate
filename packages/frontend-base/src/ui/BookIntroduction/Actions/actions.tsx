import styles from "./actions.module.css";

type ActionsProps = {
  onContinue: () => void;
  chapterNumber?: number;
};

export const Actions = ({ onContinue, chapterNumber = 1 }: ActionsProps) => {
  return (
    <div className={styles.container}>
      <button
        type="button"
        onClick={onContinue}
        className={styles.continueButton}
      >
        Continue to Chapter {chapterNumber}
      </button>
    </div>
  );
};
