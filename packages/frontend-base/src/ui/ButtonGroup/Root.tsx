import type { CSSProperties, ReactNode } from "react";

import styles from "./ButtonGroup.module.css";

interface ButtonGroupRootProps {
  children: ReactNode;
  orientation?: "horizontal" | "vertical";
  color?: string;
  appearance?: "contained" | "ghost";
  disabled?: boolean;
}

export function ButtonGroupRoot({
  children,
  orientation = "horizontal",
  color = "var(--dust)",
  appearance = "contained",
}: ButtonGroupRootProps) {
  return (
    <div
      role="group"
      style={{ "--color": color } as CSSProperties}
      className={`${styles.root} ${styles[orientation]} ${styles[appearance]}`}
    >
      {children}
    </div>
  );
}
