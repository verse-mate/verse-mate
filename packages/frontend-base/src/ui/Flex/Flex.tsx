import type React from "react";
import { forwardRef } from "react";

import stylesCSS from "./Flex.module.css";

export interface FlexOptions {
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  wrap?: React.CSSProperties["flexWrap"];
  direction?: React.CSSProperties["flexDirection"];
  basis?: React.CSSProperties["flexBasis"];
  grow?: React.CSSProperties["flexGrow"];
  shrink?: React.CSSProperties["flexShrink"];
  gap?: React.CSSProperties["gap"];
  rowGap?: React.CSSProperties["rowGap"];
  columnGap?: React.CSSProperties["columnGap"];
  width?: React.CSSProperties["width"];
  alignSelf?: React.CSSProperties["alignSelf"];
  justifySelf?: React.CSSProperties["justifySelf"];
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  as?: React.ElementType;
}

export interface FlexProps extends React.PropsWithChildren<FlexOptions> {}

export const Flex = forwardRef<HTMLDivElement, FlexProps>((props, ref) => {
  const {
    direction,
    align,
    justify,
    wrap,
    basis,
    grow,
    shrink,
    gap,
    rowGap,
    columnGap,
    className,
    width,
    alignSelf,
    justifySelf,
    style,
    ...rest
  } = props;

  const styles = {
    display: "flex",
    flexDirection: direction,
    alignItems: align,
    justifyContent: justify,
    flexWrap: wrap,
    flexBasis: basis,
    flexGrow: grow,
    flexShrink: shrink,
    rowGap,
    columnGap,
    width,
    alignSelf,
    justifySelf,
    "--gap": gap,
    ...style,
  } as React.CSSProperties;

  const Element = props.as ?? "div";

  return (
    <Element
      style={styles}
      className={`${stylesCSS.flex} ${className ?? ""}`}
      ref={ref}
      {...rest}
    />
  );
});

Flex.displayName = "Flex";
