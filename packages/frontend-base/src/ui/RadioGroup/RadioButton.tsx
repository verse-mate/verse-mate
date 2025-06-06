import { Indicator, Item } from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";

import styles from "./RadioGroup.module.css";

interface RadioButtonProps {
  value: string;
  children?: ReactNode;
}

export function RadioButton({ value, children }: RadioButtonProps) {
  return (
    <div className={styles.radioButton}>
      <Item value={value} id={value} className={styles.item}>
        <Indicator className={styles.indicator} />
      </Item>
      <label htmlFor={value} className={styles.label}>
        {children}
      </label>
    </div>
  );
}
