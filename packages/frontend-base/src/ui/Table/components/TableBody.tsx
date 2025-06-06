import type { PropsWithChildren } from "react";

import styles from "../Table.module.css";

export const TableBody = ({ children }: PropsWithChildren) => {
  return <tbody className={styles.tableBody}>{children}</tbody>;
};
