import * as RadixTabs from "@radix-ui/react-tabs";
import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  setActiveTab: (value: string) => void;
};

export const Root = ({ children, style, setActiveTab }: RootProps) => {
  return (
    <RadixTabs.Root
      className={`${styles.rightSideWrapper}`}
      style={style}
      defaultValue="explanation"
      onValueChange={setActiveTab}
    >
      {children}
    </RadixTabs.Root>
  );
};
