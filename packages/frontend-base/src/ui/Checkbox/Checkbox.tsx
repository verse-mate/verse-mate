"use client";

import {
  type CheckedState,
  Indicator,
  type CheckboxProps as RadixCheckProps,
  Root,
} from "@radix-ui/react-checkbox";
import { type ReactNode, forwardRef } from "react";
import { Check, Minus } from "react-feather";

import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  children?: ReactNode;
  id: string;
  disabled?: RadixCheckProps["disabled"];
  required?: RadixCheckProps["required"];
  defaultChecked?: RadixCheckProps["defaultChecked"];
  onCheckedChange?: RadixCheckProps["onCheckedChange"];
  checked?: RadixCheckProps["checked"];
  autoFocus?: boolean;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ id, children, checked, ...props }, ref) => {
    return (
      <div className={styles.container}>
        <Root
          {...props}
          id={id}
          ref={ref}
          className={styles.checkbox}
          checked={checked}
        >
          <Indicator>
            {checked === "indeterminate" && <Minus className={styles.minus} />}
            {(checked === true || checked === undefined) && (
              <Check className={styles.check} />
            )}
          </Indicator>
        </Root>
        <label htmlFor={id}>{children}</label>
      </div>
    );
  },
);

export type { CheckedState };
