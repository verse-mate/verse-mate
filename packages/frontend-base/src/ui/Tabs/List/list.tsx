import * as RadixTabs from "@radix-ui/react-tabs";
import styles from "./list.module.css";

type ListProps = {
  children: React.ReactNode;
};

export const List = ({ children }: ListProps) => {
  return (
    <RadixTabs.List className={styles.tabsList}>{children}</RadixTabs.List>
  );
};
