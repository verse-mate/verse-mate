import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useMemo,
} from "react";

import styles from "./Container.module.css";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  maxWidth?: CSSProperties["maxWidth"];
}

export function Container({
  children,
  className,
  maxWidth,
  ...props
}: ContainerProps) {
  const stylesMemo = useMemo(() => {
    return { maxWidth, ...props.style } as CSSProperties;
  }, [maxWidth, props.style]);

  return (
    <div
      {...props}
      className={`${styles.container} ${className || ""}`}
      style={stylesMemo}
    >
      {children}
    </div>
  );
}
