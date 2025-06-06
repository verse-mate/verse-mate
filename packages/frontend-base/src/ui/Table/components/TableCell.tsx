import type { PropsWithChildren } from "react";

import styles from "../Table.module.css";

export const TableCell = ({
  children,
  tag = "td",
}: PropsWithChildren & { tag?: "td" | "th" }) => {
  const Tag = tag;
  return <Tag className={styles.table}>{children}</Tag>;
};
