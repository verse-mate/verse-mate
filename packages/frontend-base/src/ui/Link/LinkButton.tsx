import { type CSSProperties, type LinkHTMLAttributes, useMemo } from "react";

import type { Shape } from "../../types";
import type { ButtonProps } from "../Button/Button";
import buttonStyles from "../Button/Button.module.css";
import styles from "./Link.module.css";

interface LinkButtonProps extends LinkHTMLAttributes<HTMLAnchorElement> {
  format?: Shape;
  color?: ButtonProps["color"];
  variant?: ButtonProps["variant"];
  disabled?: boolean;
}

export function LinkButton({
  color = "var(--dust)",
  format = "soft",
  variant = "contained",
  disabled,
  children,
  ...props
}: LinkButtonProps) {
  const style = useMemo(
    () =>
      ({
        "--color": color,
        ...props.style,
      }) as CSSProperties,
    [color, props.style],
  );

  return (
    <a
      {...props}
      style={style}
      className={`${styles.buttonStyle} ${buttonStyles.button} ${buttonStyles[format]} ${buttonStyles[variant]}`}
      data-disabled={disabled}
    >
      <span className={buttonStyles.content}>{children}</span>
    </a>
  );
}
