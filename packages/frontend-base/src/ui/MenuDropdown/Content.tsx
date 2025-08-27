import { Content, Portal } from "@radix-ui/react-dropdown-menu";
import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from "react";

import styles from "./MenuDropdown.module.css";

interface MenuDropdownContentProps
  extends ComponentPropsWithoutRef<typeof Content> {
  children: ReactNode;
  orientation?: "vertical" | "horizontal";
  padding?: CSSProperties["padding"];
  divider?: boolean;
}

export function MenuDropdownContent({
  children,
  orientation = "vertical",
  padding = "var(--size-1)",
  divider = false,
  ...props
}: MenuDropdownContentProps) {
  return (
    <Portal>
      <Content
        sideOffset={8}
        {...props}
        data-orientation={orientation}
        data-divider={divider}
        className={`${styles.dropdownMenuContent} ${styles[orientation]}`}
        style={
          {
            "--content-padding": padding,
            ...(props.style ?? {}),
          } as CSSProperties
        }
      >
        {children}
      </Content>
    </Portal>
  );
}
