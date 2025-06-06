import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";

import { Pagination } from "./TablePagination";

export default {
  title: "ui/table/pagination",
} satisfies StoryDefault;

export const Default: Story = () => (
  <Pagination
    onClickNext={() => {}}
    onClickPrevious={() => {}}
    onClickPage={() => {}}
    currentPage={0}
    totalPages={1}
    totalResults={0}
    take={10}
  />
);

export const WithPages: Story = () => {
  const [page, setPage] = useState(0);

  return (
    <Pagination
      onClickNext={() => {
        setPage((prev) => prev + 1);
      }}
      onClickPrevious={() => {
        setPage((prev) => prev - 1);
      }}
      onClickPage={(newPage) => {
        setPage(newPage - 1);
      }}
      currentPage={page}
      totalPages={10}
      totalResults={100}
      take={10}
    />
  );
};
