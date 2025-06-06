import { type Ref, forwardRef, useCallback } from "react";

import {
  Checkbox,
  type CheckboxProps,
  type CheckedState,
} from "../Checkbox/Checkbox";
import styles from "./CheckboxList.module.css";

type Data<T> = T & {
  id: string;
};

export interface CheckboxListItemProps<T = unknown>
  extends Omit<CheckboxProps, "onCheckedChange"> {
  data: Data<T>;
  onChangeCheckbox: (state: CheckedState, data: Data<T>) => void;
  className?: string;
}

export const CheckboxListItem = forwardRef(
  <T,>(
    { data, onChangeCheckbox, className, ...props }: CheckboxListItemProps<T>,
    ref: Ref<HTMLLIElement>,
  ) => {
    const handleChangeCheck = useCallback(
      (value: CheckedState) => {
        onChangeCheckbox(value, data);
      },
      [onChangeCheckbox, data],
    );
    return (
      <li className={`${styles.item} ${className}`} ref={ref}>
        <Checkbox onCheckedChange={handleChangeCheck} {...props}>
          {props.children}
        </Checkbox>
      </li>
    );
  },
) as <T>(
  data: CheckboxListItemProps<T>,
  ref: Ref<HTMLLIElement>,
) => JSX.Element;
