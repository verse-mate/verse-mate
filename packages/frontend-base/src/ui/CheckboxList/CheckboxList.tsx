import { type CSSProperties, useMemo } from "react";

import { Button } from "../Button/Button";
import { Text } from "../Text/Text";
import styles from "./CheckboxList.module.css";
import {
  CheckboxListItem,
  type CheckboxListItemProps,
} from "./CheckboxListItem";

export interface CheckboxListProps<T = unknown> {
  selectedList: CheckboxListItemProps<T>["data"][];
  unselectedList: CheckboxListItemProps<T>["data"][];
  onClearSelection?: () => void;
  onChange: CheckboxListItemProps<T>["onChangeCheckbox"];
  render: (data: CheckboxListItemProps<T>["data"]) => JSX.Element;
  maxHeight?: CSSProperties["maxHeight"];
}

export function CheckboxList<T = unknown>({
  selectedList,
  unselectedList,
  maxHeight,
  onClearSelection,
  onChange,
  render,
}: CheckboxListProps<T>) {
  const style = useMemo(
    () => ({ "--max-height": maxHeight }) as CSSProperties,
    [maxHeight],
  );
  return (
    <div style={style}>
      <ul className={styles.list}>
        {selectedList.map((data, index) => (
          <CheckboxListItem<T>
            key={`selected-${data.id}`}
            id={data.id}
            data={data}
            defaultChecked
            onChangeCheckbox={onChange}
            className={`${styles.item} ${
              selectedList.length - 1 === index ? styles.lastSelected : ""
            }`}
          >
            {" "}
            {render(data)}{" "}
          </CheckboxListItem>
        ))}

        {unselectedList.map((data) => (
          <CheckboxListItem<T>
            key={`unselected-${data.id}`}
            id={data.id}
            data={data}
            onChangeCheckbox={onChange}
          >
            {render(data)}
          </CheckboxListItem>
        ))}
      </ul>

      <div className={styles.listFooter}>
        <Text size="12px">{selectedList.length} selected</Text>

        {selectedList.length > 0 && (
          <Button appearance="text" onClick={onClearSelection}>
            <Text size="12px" color="var(--dust)" weight="400">
              Clear selection
            </Text>
          </Button>
        )}
      </div>
    </div>
  );
}
