import type { LinkHTMLAttributes } from "react";

import styles from "./Link.module.css";

interface LinkTextProps extends LinkHTMLAttributes<HTMLAnchorElement> {
  variant?: "none" | "flash" | "underline" | "goTo";
}

export function LinkText({
  variant = "none",
  children,
  ...props
}: LinkTextProps) {
  return (
    <a {...props} className={`${styles.link} ${styles[variant]}`}>
      <span>{children}</span>

      {variant === "goTo" && (
        <svg viewBox="0 0 13 20">
          <title>GoTo</title>
          <polyline points="0.5 19.5 3 19.5 12.5 10 3 0.5" />
        </svg>
      )}
    </a>
  );
}
