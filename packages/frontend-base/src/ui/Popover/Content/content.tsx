import * as RadixPopover from "@radix-ui/react-popover";
import styles from "./content.module.css";

type ContentProps = {
  children: React.ReactNode;
  sideOffset?: number;
  align?: "start" | "center" | "end";
  style?: React.CSSProperties;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
};

export const Content = ({
  children,
  sideOffset,
  align,
  style,
  className,
  side,
}: ContentProps) => {
  return (
    <RadixPopover.Content
      className={`${styles.container} ${className}`}
      sideOffset={sideOffset}
      align={align}
      style={style}
      side={side}
    >
      {children}
    </RadixPopover.Content>
  );
};
