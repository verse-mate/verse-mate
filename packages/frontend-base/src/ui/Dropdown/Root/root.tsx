import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type RootProps = {
  children: React.ReactNode;
};

export const Root = ({ children }: RootProps) => {
  return <DropdownMenu.Root>{children}</DropdownMenu.Root>;
};
