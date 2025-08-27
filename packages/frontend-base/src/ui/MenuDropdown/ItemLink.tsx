import { Item } from "@radix-ui/react-dropdown-menu";
import { type CSSProperties, type LinkHTMLAttributes, useMemo } from "react";

import styles from "./MenuDropdown.module.css";
import { type Color, colorsMap } from "./lib";

interface MenuDropdownLinkProps extends LinkHTMLAttributes<HTMLAnchorElement> {
  color?: Color;
  style?: CSSProperties;
}

export function MenuDropdownLink({
  children,
  color = "brand",
  style,
  ...props
}: MenuDropdownLinkProps) {
  const itemStyles = useMemo(() => {
    return {
      ...colorsMap[color],
      ...style,
    };
  }, [color, style]);

  return (
    <Item asChild>
      <a
        {...props}
        className={`${styles.item} ${styles.itemLink}`}
        style={itemStyles}
      >
        {children}
      </a>
    </Item>
  );
}
