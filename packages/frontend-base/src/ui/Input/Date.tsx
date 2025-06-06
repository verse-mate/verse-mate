"use client";

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick as useClickFloat,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import {
  DayPicker,
  type DayPickerRangeProps,
  type DayPickerSingleProps,
} from "react-day-picker";

import { Input } from ".";
import { CalendarIcon } from "../Icons";
import type { InputProps } from "./Input";
import styles from "./Input.module.css";

type DayPickerProps = DayPickerSingleProps | DayPickerRangeProps;

export interface InputDateProps
  extends Omit<InputProps, "type" | "value" | "onChange"> {
  dayPickerProps?: DayPickerProps;
}

const formatDate = (date: Date | undefined) => dayjs(date).format("MM/DD/YYYY");

export const InputDate = ({ dayPickerProps, ...rest }: InputDateProps) => {
  const [isShowDatePicker, setIsShowDatePicker] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift(),
    ],
    open: isShowDatePicker,
    onOpenChange: setIsShowDatePicker,
    whileElementsMounted: autoUpdate,
  });

  const click = useClickFloat(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  const value = useMemo(() => {
    if (!dayPickerProps?.selected) {
      return undefined;
    }

    if (dayPickerProps.mode === "single") {
      return formatDate(dayPickerProps.selected);
    }

    if (dayPickerProps.mode === "range") {
      return `${formatDate(dayPickerProps.selected.from)} - ${formatDate(
        dayPickerProps.selected.to,
      )}`;
    }

    return undefined;
  }, [dayPickerProps]);

  return (
    <div className={styles.dateInputContainer}>
      <div ref={refs.setReference} {...getReferenceProps()}>
        <Input {...rest} readOnly value={value}>
          <Input.Slot>
            <CalendarIcon />
          </Input.Slot>
        </Input>
      </div>

      {isShowDatePicker && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              style={{ ...floatingStyles, zIndex: 2 }}
              ref={refs.setFloating}
              {...getFloatingProps()}
            >
              <DayPicker {...dayPickerProps} />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
};
