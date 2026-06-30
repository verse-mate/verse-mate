import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "light" | "outline" | "dark";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center rounded-full font-inter font-semibold no-underline transition-colors duration-200 disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  // Tan pill — the default site CTA.
  primary: "bg-brand-tan text-brand-black hover:bg-brand-tan-hover",
  // White pill — primary action on dark/photo backgrounds (hero).
  light: "bg-white text-brand-black hover:bg-white/90",
  // Outline — secondary action on dark backgrounds.
  outline: "border border-white bg-transparent text-white hover:bg-white/10",
  // Black pill — the one non-tan CTA (header Give).
  dark: "bg-brand-black text-white hover:bg-brand-dark-gray",
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-14 px-8 text-base",
  sm: "h-10 px-5 text-sm md:px-6 md:text-base",
};

/**
 * Single source of truth for button/CTA styling. Use `buttonClass()` directly
 * when you need to style an element this component can't render (e.g. a
 * `mailto:` anchor or a Link with a custom onClick).
 */
export function buttonClass(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className } = opts ?? {};
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsLink = ButtonOwnProps &
  Omit<React.ComponentProps<typeof Link>, "className" | "children"> & {
    href: string;
  };

type ButtonAsButton = ButtonOwnProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

export default function Button(props: ButtonAsLink | ButtonAsButton) {
  const { variant, size, className, children, ...rest } = props;
  const cls = buttonClass({ variant, size, className });

  if (rest.href !== undefined) {
    return (
      <Link className={cls} {...(rest as ButtonAsLink)}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...(rest as ButtonAsButton)}>
      {children}
    </button>
  );
}
