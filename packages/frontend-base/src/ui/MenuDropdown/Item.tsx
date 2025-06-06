import { Item, type MenuItemProps } from "@radix-ui/react-dropdown-menu";
import { type CSSProperties, type ReactNode, useMemo } from "react";

import styles from "./MenuDropdown.module.css";
import { type Color, colorsMap } from "./lib";

interface MenuDropdownItemProps {
  children: ReactNode;
  color?: Color;
  asChild?: MenuItemProps["asChild"];
  onClick?: MenuItemProps["onClick"];
  style?: CSSProperties;
}

export function MenuDropdownItem({
  children,
  color = "brand",
  onClick,
  asChild,
  style,
}: MenuDropdownItemProps) {
  const itemStyles = useMemo(() => {
    return {
      ...colorsMap[color],
      ...style,
    };
  }, [color, style]);

  return (
    <Item
      className={styles.item}
      style={itemStyles}
      onClick={onClick}
      asChild={asChild}
    >
      {children}
    </Item>
  );
}
