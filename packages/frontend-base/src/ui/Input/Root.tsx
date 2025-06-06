import type { ReactNode } from "react";

import styles from "./Input.module.css";

interface InputRootProps {
  hasError?: boolean;
  children: ReactNode;
}

export function InputRoot({ hasError, children }: InputRootProps) {
  return (
    <div className={styles.container} data-error={hasError}>
      {children}
    </div>
  );
}
