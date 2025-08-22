import type { PropsWithChildren } from "react";

import styles from "../Table.module.css";

export const TableCell = ({
  children,
  tag = "td",
  className,
}: PropsWithChildren & { tag?: "td" | "th"; className?: string }) => {
  const Tag = tag;
  return <Tag className={`${styles.table} ${className || ""}`}>{children}</Tag>;
};
