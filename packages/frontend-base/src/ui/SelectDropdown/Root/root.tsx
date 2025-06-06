import * as RadixSelect from "@radix-ui/react-select";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import styles from "./root.module.css";

type RootProps = {
  label?: string;
  defaultValue?: string;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onValueChange?: (value: ExplanationTypeEnum) => void;
};

export const Root = ({
  label,
  defaultValue,
  children,
  open,
  onOpenChange,
  onValueChange,
}: RootProps) => {
  return (
    <RadixSelect.Root
      defaultValue={defaultValue}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={onValueChange}
    >
      <div className={styles.container}>
        <label className={styles.label}>{label}</label>
        {children}
      </div>
    </RadixSelect.Root>
  );
};
