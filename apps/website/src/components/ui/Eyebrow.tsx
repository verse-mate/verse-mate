import { cn } from "@/lib/cn";

type EyebrowProps = {
  children: React.ReactNode;
  /** "dark" for light backgrounds, "light" for dark backgrounds. */
  variant?: "dark" | "light";
  className?: string;
};

/**
 * The section "eyebrow" label (HOW IT WORKS?, WHY VERSEMATE, …). One
 * component so casing, weight, tracking and the tan underline are identical
 * everywhere instead of drifting between border-b-4 / -[5px] / -[6px].
 */
export default function Eyebrow({
  children,
  variant = "dark",
  className,
}: EyebrowProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center border-b-2 border-brand-tan pb-1.5",
        className,
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap font-inter text-eyebrow uppercase",
          variant === "light" ? "text-brand-white" : "text-brand-dark-gray",
        )}
      >
        {children}
      </span>
    </div>
  );
}
