import type { ButtonHTMLAttributes } from "react";

import styles from "./ButtonGroup.module.css";

interface ButtonGroupItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isSelected?: boolean;
  className?: string;
}

export function ButtonGroupItem({
  children,
  isSelected = false,
  className = "",
  ...props
}: ButtonGroupItemProps) {
  return (
    <button
      {...props}
      type={props.type || "button"}
      className={`${styles.item} ${className}`}
      data-is-selected={isSelected}
    >
      {children}
    </button>
  );
}
