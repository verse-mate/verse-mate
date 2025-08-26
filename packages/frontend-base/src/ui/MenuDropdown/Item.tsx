import { Item } from "@radix-ui/react-dropdown-menu";
import {
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ReactNode,
  useMemo,
} from "react";

import styles from "./MenuDropdown.module.css";
import { type Color, colorsMap } from "./lib";

interface MenuDropdownItemProps extends ComponentPropsWithoutRef<typeof Item> {
  children: ReactNode;
  color?: Color;
  style?: CSSProperties;
}

export function MenuDropdownItem({
  children,
  color = "brand",
  style,
  ...rest
}: MenuDropdownItemProps) {
  const itemStyles = useMemo(() => {
    return {
      ...colorsMap[color],
      ...style,
    };
  }, [color, style]);

  return (
    <Item className={styles.item} style={itemStyles} {...rest}>
      {children}
    </Item>
  );
}
