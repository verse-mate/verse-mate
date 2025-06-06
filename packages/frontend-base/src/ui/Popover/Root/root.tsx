import * as RadixPopover from "@radix-ui/react-popover";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return <RadixPopover.Root>{children}</RadixPopover.Root>;
};
