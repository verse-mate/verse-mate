import * as RadixTabs from "@radix-ui/react-tabs";

type ContentProps = {
  value: string;
  children: React.ReactNode;
  styles?: React.CSSProperties;
};

export const Content = ({ value, children, styles }: ContentProps) => {
  return (
    <RadixTabs.Content value={value} style={styles}>
      {children}
    </RadixTabs.Content>
  );
};
