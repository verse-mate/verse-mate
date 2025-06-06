import type { PropsWithChildren } from "react";

import styles from "../Table.module.css";

export const TableFooter = ({ children }: PropsWithChildren) => {
  return <tfoot className={styles.tableFoot}>{children}</tfoot>;
};
