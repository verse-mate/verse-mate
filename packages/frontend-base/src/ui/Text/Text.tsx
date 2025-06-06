import type React from "react";
import { type CSSProperties, useMemo } from "react";

export type TextTypes =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "span"
  | "b";

const variantsTypography: Record<TextTypes, string> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  p: "p",
  span: "span",
  b: "b",
};

export interface TypographyProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
  variant?: React.ElementType;
  weight?: CSSProperties["fontWeight"];
  transform?: CSSProperties["textTransform"];
  whiteSpace?: CSSProperties["whiteSpace"];
  textOverflow?: CSSProperties["textOverflow"];
  align?: CSSProperties["textAlign"];
  overflow?: CSSProperties["overflow"];
  color?: string;
  size?: CSSProperties["fontSize"];
  leading?: CSSProperties["lineHeight"];
}

export function Text({
  variant = "p",
  weight,
  children,
  transform,
  overflow,
  textOverflow,
  whiteSpace,
  align,
  color = "var(--foreground)",
  size,
  leading,
  ...rest
}: TypographyProps) {
  const CustomComponent: React.ElementType = Object.keys(
    variantsTypography,
  ).includes(variant as string)
    ? variant
    : "p";

  const { style, className, ...otherProps } = rest;

  const styles = useMemo(() => {
    return {
      textTransform: transform,
      overflow,
      textOverflow,
      whiteSpace,
      textAlign: align,
      color,
      fontSize: size,
      fontWeight: weight,
      lineHeight: leading,
      ...style,
    };
  }, [
    transform,
    overflow,
    textOverflow,
    whiteSpace,
    leading,
    size,
    align,
    weight,
    color,
    style,
  ]);

  return (
    <CustomComponent className={className} style={styles} {...otherProps}>
      {children}
    </CustomComponent>
  );
}
