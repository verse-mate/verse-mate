"use client";

import { AnimatePresence, type AnimationProps, motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "react-feather";

import styles from "./Alert.module.css";

const initial: AnimationProps["initial"] = {
  y: "20%",
  opacity: 0.5,
};

const exit: AnimationProps["exit"] = {
  y: "50%",
  opacity: 0,
};

const animate: AnimationProps["animate"] = {
  opacity: 1,
  y: 0,
};

type Variants = "success" | "info" | "warning" | "error";

const colorMap: { [key in Variants]: string } = {
  success: "var(--success)",
  error: "var(--error)",
  info: "var(--dust)",
  warning: "var(--warning)",
};

const alertTypes: { [key in Variants]: ReactNode } = {
  success: <CheckCircle />,
  error: <AlertCircle />,
  warning: <AlertTriangle />,
  info: <Info />,
};

interface AlertProps {
  children?: ReactNode;
  type?: Variants;
  show?: boolean;
  popLayout?: boolean;
  variant?: "discreet" | "colored";
}

export function Alert({
  children,
  type = "info",
  show,
  popLayout = false,
  variant = "discreet",
}: AlertProps) {
  return (
    <AnimatePresence mode={popLayout ? "popLayout" : "sync"}>
      {show && (
        <motion.div
          initial={initial}
          exit={exit}
          animate={animate}
          style={
            {
              "--color": colorMap[type],
            } as CSSProperties
          }
          className={`${styles.container} ${styles[variant]}`}
        >
          {alertTypes[type]}
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
