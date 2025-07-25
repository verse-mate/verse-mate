import * as RadixTabs from "@radix-ui/react-tabs";
import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  activeTab: string;
  setActiveTab: (value: string) => void;
};

export const Root = ({
  children,
  style,
  activeTab,
  setActiveTab,
}: RootProps) => {
  return (
    <RadixTabs.Root
      className={`${styles.rightSideWrapper}`}
      style={style}
      value={activeTab}
      onValueChange={setActiveTab}
    >
      {children}
    </RadixTabs.Root>
  );
};
