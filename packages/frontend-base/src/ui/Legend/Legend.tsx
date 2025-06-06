import { type CSSProperties, type ReactNode, useMemo } from "react";

import styles from "./Legend.module.css";

interface LegendProps {
  children: ReactNode;
  color?: string;
  outline?: boolean;
  size?: CSSProperties["width"];
}

export function Legend({
  children,
  color = "var(--dust)",
  outline = false,
  size,
}: LegendProps) {
  const style = useMemo(() => {
    return { "--size": size } as CSSProperties;
  }, [size]);

  return (
    <label style={style} className={styles.legend} data-outline={outline}>
      <div style={{ backgroundColor: color }} className={styles.square} />
      {children}
    </label>
  );
}
