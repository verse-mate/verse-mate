import type { StoryDefault } from "@ladle/react";

import { Avatar } from "../Avatar";
import { CheckboxList, type CheckboxListProps } from "./CheckboxList";

export default {
  title: "ui/CheckboxList",
} as StoryDefault;

interface Data {
  name: string;
  avatarUrl: string;
}

const selectedList: CheckboxListProps<Data>["selectedList"] = new Array(5)
  .fill("")
  .map((_, index) => ({
    avatarUrl: `https://i.pravatar.cc/150?img=${index + 13}`,
    id: `selected${index}`,
    name: "Name",
  }));

const unselectedList: CheckboxListProps<Data>["unselectedList"] = new Array(5)
  .fill("")
  .map((_, index) => ({
    avatarUrl: `https://i.pravatar.cc/150?img=${index}`,
    id: `unselected${index}`,
    name: "Name",
  }));

const render: CheckboxListProps<Data>["render"] = ({ avatarUrl }) => (
  <Avatar fallback="" size="sm" src={avatarUrl} />
);

export const Default = () => (
  <CheckboxList
    selectedList={selectedList}
    unselectedList={unselectedList}
    onChange={(state, data) => console.log({ state, data })}
    render={render}
    maxHeight={"260px"}
  />
);
