import type React from "react";
import { forwardRef } from "react";
import { cls } from "../../utils/cls";
import styles from "./TextArea.module.css";

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (props, ref) => {
    return (
      <textarea
        {...props}
        className={cls(styles.textarea, props.className ?? "")}
        ref={ref}
      />
    );
  },
);
