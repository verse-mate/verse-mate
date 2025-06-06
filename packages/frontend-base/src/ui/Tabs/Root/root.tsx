import * as RadixTabs from "@radix-ui/react-tabs";

type RootProps = {
  children: React.ReactNode;
  value: string;
  onValueChange: (tab: string) => void;
};

export const Root = ({ value, onValueChange, children }: RootProps) => {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      {children}
    </RadixTabs.Root>
  );
};
