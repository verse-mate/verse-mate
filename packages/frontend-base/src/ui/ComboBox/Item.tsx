import {
  type KeyboardEventHandler,
  type LiHTMLAttributes,
  type Ref,
  forwardRef,
  useCallback,
} from "react";

import styles from "./Combobox.module.css";

export interface ComboboxItemProps<T>
  extends Omit<LiHTMLAttributes<HTMLLIElement>, "onSelect" | "value"> {
  onSelect: (data: T) => void;
  data: T;
}

export const ComboboxItem = forwardRef(
  <T,>(
    { onSelect, data, ...props }: ComboboxItemProps<T>,
    ref: Ref<HTMLLIElement>,
  ) => {
    const handleKeyDown: KeyboardEventHandler<HTMLLIElement> = useCallback(
      ({ key }) => {
        if (key === "Enter") {
          onSelect(data);
        }
      },
      [data, onSelect],
    );

    const handleOnClick = useCallback(() => {
      onSelect(data);
    }, [data, onSelect]);

    return (
      <li
        ref={ref}
        onKeyDown={handleKeyDown}
        onClick={handleOnClick}
        className={styles.item}
        {...props}
      >
        {props.children}
      </li>
    );
  },
) as <T = unknown>(
  props: ComboboxItemProps<T> & { ref?: Ref<HTMLFormElement> },
) => JSX.Element;
