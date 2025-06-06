import { Table as Root, type TableColumn, type TableProps } from "./Table";
import { Pagination } from "./TablePagination";

export const Table = Object.assign(Root, {
  Pagination,
});

export type { TableColumn, TableProps };
