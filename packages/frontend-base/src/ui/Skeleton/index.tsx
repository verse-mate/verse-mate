import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

interface SkeletonProps {
  height?: CSSProperties["height"];
  width?: CSSProperties["width"];
}
export function Skeleton({ height = "100%", width = "100%" }: SkeletonProps) {
  return <div className={styles.skeleton} style={{ height, width }} />;
}
