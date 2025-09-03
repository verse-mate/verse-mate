import * as RadixSelect from "@radix-ui/react-select";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { useCallback } from "react";
import styles from "./root.module.css";

type RootProps = {
  label?: string;
  defaultValue?: string;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onValueChange?: (value: ExplanationTypeEnum) => void;
  resetFilter?: () => void;
  className?: string;
};

export const Root = ({
  label,
  defaultValue,
  children,
  open,
  onOpenChange,
  onValueChange,
  resetFilter,
  className,
}: RootProps) => {
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && resetFilter) {
        resetFilter();
      }
      onOpenChange?.(isOpen);
    },
    [onOpenChange, resetFilter],
  );

  return (
    <RadixSelect.Root
      defaultValue={defaultValue}
      open={open}
      onOpenChange={handleOpenChange}
      onValueChange={onValueChange}
    >
      <div className={`${styles.container} ${className}`}>
        <label className={styles.label}>{label}</label>
        {children}
      </div>
    </RadixSelect.Root>
  );
};
