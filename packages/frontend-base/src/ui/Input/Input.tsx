import { type InputHTMLAttributes, forwardRef } from "react";

import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  format?: "rounded" | "soft" | "square";
  appearance?: "border" | "shadow";
  containerClassName?: string;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      hasError,
      appearance = "border",
      format = "soft",
      type = "text",
      containerClassName = "",
      containerProps,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={`${styles.inputContainer} ${styles[appearance]} ${styles[format]} ${containerClassName}`}
        data-error={hasError}
        {...containerProps}
      >
        <input
          {...props}
          ref={ref}
          type={type}
          className={`${styles.input} ${props.className ?? ""}`}
        />
        {children}
      </div>
    );
  },
);
