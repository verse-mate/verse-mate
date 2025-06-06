import type { PropsWithChildren } from "react";

import styles from "../Table.module.css";

export const TableHead = ({ children }: PropsWithChildren) => {
  return <thead className={styles.tableHead}>{children}</thead>;
};
