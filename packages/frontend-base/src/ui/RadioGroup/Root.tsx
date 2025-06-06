import {
  type RadioGroupProps as RadixProps,
  Root,
} from "@radix-ui/react-radio-group";
import { type CSSProperties, type ReactNode, useMemo } from "react";

import styles from "./RadioGroup.module.css";

interface RadioGroupProps {
  onValueChange?: RadixProps["onValueChange"];
  orientation?: RadixProps["orientation"];
  value?: RadixProps["value"];
  disabled?: boolean;
  requires?: boolean;
  name?: string;
  children?: ReactNode;
  gap?: CSSProperties["gap"];
}

export function RadioGroupRoot(props: RadioGroupProps) {
  const style = useMemo(() => {
    return {
      "--gap": props.gap,
    } as CSSProperties;
  }, [props.gap]);
  return <Root className={styles.root} style={style} {...props} />;
}
