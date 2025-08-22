import * as RadixTabs from "@radix-ui/react-tabs";
import React from "react";
import styles from "./root.module.css";

type RootProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  activeTab: string;
  setActiveTab: (value: string) => void;
  rightPanelContent: string;
  setRightPanelContent: (value: string) => void;
};

export const Root = ({
  children,
  style,
  activeTab,
  setActiveTab,
  rightPanelContent,
  setRightPanelContent,
}: RootProps) => {
  return (
    <RadixTabs.Root
      className={`${styles.rightSideWrapper}`}
      style={style}
      value={activeTab}
      onValueChange={setActiveTab}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            rightPanelContent,
            setRightPanelContent,
          });
        }
        return child;
      })}
    </RadixTabs.Root>
  );
};
