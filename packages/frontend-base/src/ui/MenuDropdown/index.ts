import { Group, Root, Trigger } from "@radix-ui/react-dropdown-menu";

import { MenuDropdownContent } from "./Content";
import { MenuDropdownItem } from "./Item";
import { MenuDropdownLink } from "./ItemLink";

const Item = Object.assign(MenuDropdownItem, {
  Link: MenuDropdownLink,
});

export const MenuDropDown = Object.assign(Root, {
  Content: MenuDropdownContent,
  Item,
  Group,
  Trigger,
});
