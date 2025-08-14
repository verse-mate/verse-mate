import React from "react";
import styles from "./Modal.module.css";
import { removeModal } from "./store";
import type { ModalProps } from "./types";

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (props, ref) => {
    return (
      <div className={styles.modal} ref={ref}>
        <div className={styles.modalContent}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => removeModal(props.id ?? "")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Close</title>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {props.content}
        </div>
      </div>
    );
  },
);
