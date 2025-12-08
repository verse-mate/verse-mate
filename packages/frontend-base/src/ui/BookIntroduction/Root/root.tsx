import type React from "react";
import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return <div className={styles.container}>{children}</div>;
};
