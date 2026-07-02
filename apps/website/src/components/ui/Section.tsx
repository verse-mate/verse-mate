import { cn } from "@/lib/cn";
import Container from "./Container";

type SectionProps = {
  children: React.ReactNode;
  /** Extra classes on the outer <section> (use for full-bleed backgrounds). */
  className?: string;
  /** Extra classes on the inner Container. */
  containerClassName?: string;
  /** Render without the inner Container (when the section manages its own). */
  bare?: boolean;
  id?: string;
};

/**
 * Consistent vertical rhythm for every page section. One scale, applied
 * everywhere, replaces the ad-hoc per-section py-12/16/20/24/[83px] values.
 */
export default function Section({
  children,
  className,
  containerClassName,
  bare = false,
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn("w-full py-16 md:py-24 lg:py-28", className)}
    >
      {bare ? children : <Container className={containerClassName}>{children}</Container>}
    </section>
  );
}
