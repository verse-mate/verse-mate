"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

import ThreeDotsLoadingIcon from "../Icons/ThreeDotsLoadingIcon/ThreeDotsLoadingIcon";
import styles from "./Avatar.module.css";

const sizes: Record<string, string> = {
  xs: "24px",
  sm: "32px",
  md: "48px",
  lg: "64px",
  xl: "90px",
  "2xl": "120px",
};

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback: ReactNode;
  children?: ReactNode;
  format?: "rounded" | "soft" | "square";
  outline?: boolean;
  size?: keyof typeof sizes | number;
  outlineWidth?: string;
  outlineColor?: string;
  isLoading?: boolean;
}

export function AvatarImage({
  fallback,
  src,
  alt,
  outline = false,
  format = "rounded",
  children,
  size = "md",
  outlineColor = "var(--background)",
  outlineWidth = "2px",
  isLoading,
}: AvatarProps) {
  const [error, setError] = useState(false);
  const className = `${styles.avatarWrapper} ${styles[format]}`;
  const onError = useCallback(() => {
    setError(true);
  }, []);

  const sizeSelected: CSSProperties = useMemo(() => {
    if (typeof size === "string") {
      return {
        width: sizes[size],
        height: sizes[size],
        fontSize: ["sm", "xs"].includes(size)
          ? "var(--font-size-00)"
          : undefined,
      };
    }

    return {
      width: size,
      height: size,
    };
  }, [size]);

  const style: CSSProperties = useMemo(() => {
    return {
      ...sizeSelected,
      "--outline-color": outlineColor,
      "--outline-width": outlineWidth,
    };
  }, [sizeSelected, outlineColor, outlineWidth]);

  if (!src || error) {
    return (
      <span
        className={`${className} ${styles.fallback}`}
        style={style}
        data-outline={outline}
      >
        {isLoading ? (
          <ThreeDotsLoadingIcon />
        ) : (
          <>
            {fallback}
            {children}
          </>
        )}
      </span>
    );
  }

  return (
    <span className={className} style={style} data-outline={outline}>
      {isLoading ? (
        <ThreeDotsLoadingIcon />
      ) : (
        <>
          <img src={src} onError={onError} alt={alt} />
          {children}
        </>
      )}
    </span>
  );
}
