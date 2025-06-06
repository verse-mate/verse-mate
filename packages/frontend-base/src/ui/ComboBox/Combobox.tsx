"use client";

import { AnimatePresence, type HTMLMotionProps, motion } from "framer-motion";
import {
  type ChangeEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useClick } from "../../hooks/useClick";
import { Button } from "../Button/Button";
import { ArrowDropDownIcon } from "../Icons";
import { Input } from "../Input";
import type { InputProps } from "../Input/Input";
import styles from "./Combobox.module.css";
import { ComboboxItem, type ComboboxItemProps } from "./Item";

const animation: HTMLMotionProps<"ul"> = {
  initial: {
    opacity: 0,
    y: -10,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -10,
  },
};

export interface ComboboxProps<T = unknown>
  extends Omit<InputProps, "defaultValue"> {
  onChangeValue?: ComboboxItemProps<T>["onSelect"];
  options?: ComboboxItemProps<T>["data"][];
  labelKey: keyof T;
  valueKey: keyof T;
}

// Todo: Add list navigation via keyboard.
export function Combobox<T>({
  onChangeValue,
  options,
  value,
  labelKey,
  valueKey,
  ...props
}: ComboboxProps<T>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Biome issue
  const optionSelected = useMemo(() => {
    return options?.find((option) => option[valueKey] === value);
  }, [options, value]);

  const handleOpen: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      props.onChange?.(e);
      setIsOpen(true);

      setTimeout(() => {
        firstItemRef.current?.focus();
      }, 100);
    },
    [props.onChange],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSetInputValue = useCallback((value: string) => {
    if (inputRef.current) {
      inputRef.current.value = value;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO: need review
  useEffect(() => {
    handleSetInputValue(String(optionSelected?.[labelKey] ?? ""));
  }, [optionSelected, value]);

  const handleClickOutside = useCallback(() => {
    handleSetInputValue(String(optionSelected?.[labelKey] ?? ""));
    setIsOpen(false);
  }, [labelKey, optionSelected, handleSetInputValue]);

  useClick({
    refs: [contentRef],
    onClickOutside: handleClickOutside,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const handleSelect = useCallback(
    (data: ComboboxItemProps<T>["data"]) => {
      handleSetInputValue(String(data[labelKey]));
      onChangeValue?.(data);
      setIsOpen(false);
    },
    [labelKey],
  );

  return (
    <div className={`${styles.wrapper} ${props.className}`} ref={contentRef}>
      <Input {...props} onChange={handleOpen} ref={inputRef}>
        <Input.Slot right>
          <Button
            appearance="text"
            variant="ghost"
            onClick={handleToggle}
            tabIndex={-1}
          >
            <ArrowDropDownIcon color="var(--foreground)" />
          </Button>
        </Input.Slot>
      </Input>
      <AnimatePresence>
        {isOpen && (
          <motion.ul
            role="listbox"
            className={styles.content}
            ref={listRef}
            {...animation}
            autoFocus
            tabIndex={0}
          >
            {options?.map((data, index) => (
              <ComboboxItem<T>
                key={`combobox-option-${index}-${data[valueKey]}`}
                onSelect={handleSelect}
                data={data}
                autoFocus={index === 0}
              >
                {String(data[labelKey] ?? "")}
              </ComboboxItem>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
