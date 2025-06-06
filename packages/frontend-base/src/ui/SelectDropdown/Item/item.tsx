import * as RadixSelect from "@radix-ui/react-select";
import React from "react";
import styles from "./item.module.css";

type ItemProps = {
  children: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
};

export const Item = React.forwardRef<
  HTMLDivElement,
  ItemProps & RadixSelect.SelectItemProps
>(({ children, icon, className, ...props }, forwardedRef) => {
  return (
    <RadixSelect.Item
      className={`${styles.item} ${className}`}
      {...props}
      ref={forwardedRef}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator className={styles.itemIndicator}>
        {icon}
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
});
