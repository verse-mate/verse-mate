"use client";
import { Button } from "../../Button/Button";
import { Dialog } from "../../Dialog";
import styles from "./Explanations.module.css";

interface Explanation {
  explanation_id: number;
  type: string;
  explanation: string;
  is_active: boolean;
  version: number;
  created_at: Date;
}

interface ExplanationDetailModalProps {
  explanation: Explanation | null;
  onClose: () => void;
}

export const ExplanationDetailModal = ({
  explanation,
  onClose,
}: ExplanationDetailModalProps) => {
  if (!explanation) {
    return null;
  }

  return (
    <Dialog open={!!explanation} onOpenChange={onClose} maxWidth="800px">
      <Dialog.Content>
        <Dialog.Head>
          Explanation Details (ID: {explanation.explanation_id})
        </Dialog.Head>
        <div className={styles.modalContent}>
          <div className={styles.modalDetail}>
            <strong>Type:</strong> {explanation.type}
          </div>
          <div className={styles.modalDetail}>
            <strong>Version:</strong> {explanation.version}
          </div>
          <div className={styles.modalDetail}>
            <strong>Status:</strong>{" "}
            {explanation.is_active ? "Active" : "Inactive"}
          </div>
          <div className={styles.modalDetail}>
            <strong>Created:</strong>{" "}
            {new Date(explanation.created_at).toLocaleString()}
          </div>
          <hr className={styles.modalSeparator} />
          <p className={styles.modalExplanationText}>
            {explanation.explanation}
          </p>
        </div>
        <Dialog.Footer>
          <Button onClick={onClose} variant="outlined">
            Close
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};
