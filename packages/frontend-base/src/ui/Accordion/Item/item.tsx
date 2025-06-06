import * as RadixAccordion from "@radix-ui/react-accordion";
import styles from "./item.module.css";

type ItemProps = {
  children: React.ReactNode;
  value: string;
};
export const Item = ({ value, children }: ItemProps) => {
  return (
    <RadixAccordion.Item
      className={`${styles.item} ${styles.header}`}
      value={value}
    >
      {children}
    </RadixAccordion.Item>
  );
};
