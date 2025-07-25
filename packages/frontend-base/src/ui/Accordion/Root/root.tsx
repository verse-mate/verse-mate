import * as RadixAccordion from "@radix-ui/react-accordion";
import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  type?: "single" | "multiple";
  onValueChange?: (value: string | string[]) => void;
};

export const Root = ({ style, children, type, onValueChange }: RootProps) => {
  return (
    <RadixAccordion.Root
      className={styles.root}
      type={type || "multiple"}
      style={style}
      onValueChange={onValueChange}
    >
      {children}
    </RadixAccordion.Root>
  );
};
