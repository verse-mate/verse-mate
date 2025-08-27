"use client";

import styles from "./ConfirmationModal.module.css";

interface ConfirmationModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal = ({
  message,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) => {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <p>{message}</p>
        <div className={styles.buttonContainer}>
          <button type="button" onClick={onConfirm}>
            Confirm
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
