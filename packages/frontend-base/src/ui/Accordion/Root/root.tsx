import * as RadixAccordion from "@radix-ui/react-accordion";
import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  type?: "single" | "multiple";
  onValueChange?: (value: string | string[]) => void;
  defaultValue?: string | string[];
};

export const Root = ({
  style,
  children,
  type = "multiple",
  onValueChange,
  defaultValue,
}: RootProps) => {
  return (
    <RadixAccordion.Root
      className={styles.root}
      type={type}
      style={style}
      onValueChange={onValueChange}
      defaultValue={defaultValue as any}
    >
      {children}
    </RadixAccordion.Root>
  );
};
