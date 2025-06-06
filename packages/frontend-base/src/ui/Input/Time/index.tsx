"use client";

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { forwardRef, useCallback, useMemo, useState } from "react";

import { useTime } from "../../../hooks/useTime";
import type { Time } from "../../../types";
import { ClockIcon } from "../../Icons";
import { Input, type InputProps } from "../Input";
import styles from "../Input.module.css";
import { InputSlot } from "../Slot";
import { TimePicker } from "./TimePicker";

export interface InputTimeProps extends Omit<InputProps, "onChange"> {
  onChange?: (value: string) => void;
}

export const InputTime = forwardRef<HTMLInputElement, InputTimeProps>(
  ({ value, onChange, ...rest }, ref) => {
    const [isShowTimePicker, setIsShowTimePicker] = useState(false);

    const { parseTimeString, formatTimeTo24Hour, formatTimeTo12Hour } =
      useTime();

    const valueParsed = useMemo(
      () => parseTimeString(value) ?? { hour: 0, minute: 0, period: "AM" },
      [parseTimeString, value],
    );

    const handleChange = useCallback(
      (changes: Partial<Time>) => {
        onChange?.(formatTimeTo24Hour({ ...valueParsed, ...changes }));
      },
      [valueParsed, onChange, formatTimeTo24Hour],
    );

    const { refs, floatingStyles, context } = useFloating({
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [
        offset(8),
        flip({ fallbackAxisSideDirection: "end" }),
        shift(),
      ],
      open: isShowTimePicker,
      onOpenChange: setIsShowTimePicker,
      whileElementsMounted: autoUpdate,
    });

    const click = useClick(context);
    const dismiss = useDismiss(context);
    const role = useRole(context);

    const { getReferenceProps, getFloatingProps } = useInteractions([
      click,
      dismiss,
      role,
    ]);

    return (
      <div className={styles.dateInputContainer}>
        <div ref={refs.setReference} {...getReferenceProps()}>
          <Input
            {...rest}
            type="text"
            ref={ref}
            value={formatTimeTo12Hour(valueParsed)}
            readOnly
            aria-label="time"
          >
            <InputSlot>
              <ClockIcon />
            </InputSlot>
          </Input>
        </div>
        {isShowTimePicker && (
          <FloatingPortal>
            <FloatingFocusManager context={context} modal={false}>
              <div
                style={{ ...floatingStyles, zIndex: 2 }}
                ref={refs.setFloating}
                {...getFloatingProps()}
              >
                <TimePicker
                  {...valueParsed}
                  onChangeHour={(hour) => handleChange({ hour })}
                  onChangeMinute={(minute) => handleChange({ minute })}
                  onChangePeriod={(period) => handleChange({ period })}
                />
              </div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </div>
    );
  },
);
