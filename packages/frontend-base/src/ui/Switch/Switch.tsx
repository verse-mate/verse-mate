import type { InputHTMLAttributes, ReactNode } from "react";

import styles from "./Switch.module.css";

export interface SwitchProps {
  id: string;
  children?: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
}

export function Switch({
  onChange,
  id,
  children,
  disabled,
  checked,
}: SwitchProps) {
  return (
    <label className={styles.container} htmlFor={id} aria-disabled={disabled}>
      <div className={styles.switchWrapper}>
        <input
          onChange={onChange}
          type="checkbox"
          className={styles.checkbox}
          disabled={disabled}
          checked={checked}
          id={id}
        />
        <div className={styles.slider} />
        <div className={styles.circle} />
      </div>
      {children}
    </label>
  );
}
