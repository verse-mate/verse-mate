import type { ReactNode } from "react";

import styles from "./Input.module.css";

interface InputSlotProps {
  right?: boolean;
  padding?: "on" | "off";
  children: ReactNode;
}

export function InputSlot({ right, children, padding }: InputSlotProps) {
  return (
    <div
      className={styles.slot}
      data-position={right ? "right" : undefined}
      data-padding={padding}
    >
      {children}
    </div>
  );
}
