import type { ReactNode } from "react";

import { Skeleton } from "../Skeleton";
import styles from "./Table.module.css";
import { TableBody } from "./components/TableBody";
import { TableCell } from "./components/TableCell";
import { TableFooter } from "./components/TableFooter";
import { TableHead } from "./components/TableHead";
import { TableRow } from "./components/TableRow";

const skeletonRowsFake = new Array(5).fill("");

export type TableColumn<T> = {
  title: string | ReactNode;
  property: keyof T;
  render?: (item: T) => ReactNode;
  className?: string;
};

export type TableProps<T> = {
  columns: TableColumn<T>[];
  data?: (T & { id: string; rowProps?: JSX.IntrinsicElements["tr"] })[];
  footerData?: string[];
  zebra?: boolean;
  isLoading?: boolean;
};

export const Table = <T,>({
  zebra,
  columns,
  data = [],
  footerData = [],
  isLoading,
}: TableProps<T>) => {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table} data-zebra={zebra}>
        <TableHead>
          <TableRow>
            {columns.map((col, colIndex) => (
              <TableCell
                tag="th"
                key={`${String(col.property)}-${colIndex}`}
                className={col.className}
              >
                {col.title}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading &&
            skeletonRowsFake.map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: this is created on demand
              <TableRow key={index}>
                {columns.map((col, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: this is created on demand
                  <TableCell key={j} className={col.className}>
                    <Skeleton height={"1rem"} />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!isLoading &&
            data.map((item) => (
              <TableRow key={item.id} {...item.rowProps}>
                {columns.map((col, colIndex) => (
                  <TableCell
                    key={`${item.id}-${String(col.property)}-${colIndex}`}
                    className={col.className}
                  >
                    {col.render
                      ? col.render(item)
                      : (item[col.property] as any)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>

        {footerData.length > 0 && (
          <TableFooter>
            <TableRow>
              {footerData.map((item) => (
                <TableCell key={item}>{item}</TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </table>

      {!isLoading && data.length === 0 && (
        <div className={styles.noResult}>No results found.</div>
      )}
    </div>
  );
};
