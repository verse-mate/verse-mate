import styles from "./actions.module.css";

type ActionsProps = {
  onContinue: () => void;
};

export const Actions = ({ onContinue }: ActionsProps) => {
  return (
    <div className={styles.container}>
      <button
        type="button"
        onClick={onContinue}
        className={styles.continueButton}
      >
        Continue to Chapter 1
      </button>
    </div>
  );
};
