import type { PropsWithChildren } from "react";

import styles from "../Table.module.css";

export type TableRowProps = PropsWithChildren & JSX.IntrinsicElements["tr"];

export const TableRow = ({ children, ...rest }: TableRowProps) => {
  return (
    <tr className={`${styles.tableRow} ${rest.className ?? ""}`} {...rest}>
      {children}
    </tr>
  );
};
