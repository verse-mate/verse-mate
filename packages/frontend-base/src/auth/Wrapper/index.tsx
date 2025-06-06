import type { ReactNode } from "react";

import styles from "./Wrapper.module.css";

export const AuthWrapper = ({ children }: { children: ReactNode }) => {
  return <div className={styles.wrapper}>{children}</div>;
};
