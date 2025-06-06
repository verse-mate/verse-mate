import type { ReactNode } from "react";

import styles from "./Badge.module.css";

interface CommonProps {
  className?: string;
}

export interface BadgeProps {
  children?: ReactNode;
  color?: "brand" | "success" | "error";
  size?: "xs" | "sm" | "md" | "lg";
  outline?: "none" | "outline";
}

export function Badge({
  color = "brand",
  size = "md",
  children,
  outline = "none",
}: BadgeProps) {
  const style = `${styles.base} ${styles[color]} ${styles[size]} ${styles[outline]}`;

  switch (typeof children) {
    case "number":
      return <BadgeNumber className={style} value={children} />;
    case "string":
      return <BadgeText className={style} text={children} />;
    default:
      return <BadgeNormal className={style}>{children}</BadgeNormal>;
  }
}

function BadgeNormal({
  className,
  children,
}: CommonProps & { children: ReactNode }) {
  return <span className={`${styles.badge} ${className}`}>{children}</span>;
}

function BadgeNumber({ className, value }: CommonProps & { value: number }) {
  const valueParsed = value > 99 ? "99+" : value;
  return <span className={`${styles.badge} ${className}`}>{valueParsed}</span>;
}

function BadgeText({ className, text }: CommonProps & { text: string }) {
  return <span className={`${styles.badgeText} ${className}`}>{text}</span>;
}
