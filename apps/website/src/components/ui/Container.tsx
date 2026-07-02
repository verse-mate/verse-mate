import { cn } from "@/lib/cn";

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Single source of truth for horizontal page rhythm. Every section's inner
 * content is wrapped in this so the max-width and gutters stay identical
 * down the whole page.
 */
export default function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1200px] px-6 md:px-10 lg:px-16",
        className,
      )}
    >
      {children}
    </div>
  );
}
