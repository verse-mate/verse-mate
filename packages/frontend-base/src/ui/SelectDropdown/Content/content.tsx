import * as RadixSelect from "@radix-ui/react-select";
import styles from "./content.module.css";

type ContentProps = {
  align: "start" | "center" | "end";
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export const Content = ({ children, align, style }: ContentProps) => {
  return (
    <RadixSelect.Content
      className={styles.content}
      position="popper"
      align={align}
      style={style}
    >
      {children}
    </RadixSelect.Content>
  );
};
