"use client";

import type { LabelHTMLAttributes, ReactNode } from "react";

import styles from "./Input.module.css";

interface InputLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label: string;
  children?: ReactNode;
  notShow?: boolean;
}

export function InputHead({
  label,
  children,
  notShow,
  ...props
}: InputLabelProps) {
  return (
    <span className={styles.head} data-hidden={notShow}>
      <label {...props}>{label}</label>
      {children}
    </span>
  );
}
