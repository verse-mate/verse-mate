import type { ReactNode } from "react";

import styles from "./Dialog.module.css";

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}
