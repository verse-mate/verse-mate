import type { ReactNode } from "react";

import styles from "./Dialog.module.css";

export function DialogContent({ children }: { children: ReactNode }) {
  return <div className={styles.main}>{children}</div>;
}
