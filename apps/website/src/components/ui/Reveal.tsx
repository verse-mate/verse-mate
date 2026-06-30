import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in ms (applied via transition-delay). */
  delayMs?: number;
};

/**
 * Subtle scroll-reveal. The hidden/visible styling lives in globals.css
 * gated behind the `.js` html class, so users without JS (and those who
 * prefer reduced motion) always see fully-rendered content — no blank flash.
 */
export default function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      el.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(className)}
    >
      {children}
    </div>
  );
}
