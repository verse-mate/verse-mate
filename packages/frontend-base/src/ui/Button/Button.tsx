import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  forwardRef,
  useMemo,
} from "react";

import type { Shape } from "../../types";
import ThreeDotsLoadingIcon from "../Icons/ThreeDotsLoadingIcon/ThreeDotsLoadingIcon";
import styles from "./Button.module.css";

export interface ButtonProps {
  children: ReactNode;
  format?: Shape;
  color?: string;
  variant?: "contained" | "outlined" | "ghost";
  appearance?: "button" | "text";
  disabled?: boolean;
  loading?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  style?: ButtonHTMLAttributes<HTMLButtonElement>["style"];
  name?: string;
  className?: string;
  tabIndex?: number;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      onClick,
      format = "soft",
      color = "var(--dust)",
      variant = "contained",
      disabled,
      loading,
      type = "button",
      className = "",
      appearance = "button",
      tabIndex,
      ...props
    },
    ref,
  ) => {
    const style = useMemo(
      () =>
        ({
          "--color": color,
          ...props.style,
        }) as CSSProperties,
      [color, props.style],
    );

    return (
      <button
        ref={ref}
        {...props}
        style={style}
        onClick={onClick}
        className={`${styles[appearance]} ${styles[format]} ${styles[variant]} ${className}`}
        data-disabled={disabled}
        disabled={disabled || loading}
        data-loading={loading}
        tabIndex={tabIndex}
        type={type}
      >
        <span className={styles.content}>{children}</span>

        <span hidden={!loading} className={styles.loading}>
          <ThreeDotsLoadingIcon height={36} width={36} />
        </span>
      </button>
    );
  },
);
