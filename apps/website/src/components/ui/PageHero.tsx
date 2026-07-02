import Container from "@/components/ui/Container";
import Eyebrow from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  /** Background image path under /public. */
  image: string;
  align?: "left" | "center";
  children?: React.ReactNode;
};

/**
 * Shared hero for inner marketing pages (volunteer, give, support, …):
 * a photo background with a left-dark overlay for legibility, a consistent
 * eyebrow + Merriweather title, and optional body copy. Sits directly below
 * the sticky header — no pt-[..] offset hacks.
 */
export default function PageHero({
  eyebrow,
  title,
  image,
  align = "left",
  children,
}: PageHeroProps) {
  const center = align === "center";
  return (
    <section
      className="relative w-full bg-cover bg-center"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 100%), url('${image}')`,
      }}
    >
      <Container
        className={cn(
          "flex flex-col gap-6 py-20 md:py-28 lg:py-32",
          center ? "items-center text-center" : "items-start",
        )}
      >
        {eyebrow ? <Eyebrow variant="light">{eyebrow}</Eyebrow> : null}
        <h1 className="m-0 max-w-[900px] font-merriweather text-section-title text-white">
          {title}
        </h1>
        {children ? (
          <div
            className={cn(
              "flex max-w-[760px] flex-col gap-4 font-inter text-body-lg text-white/90",
              center && "items-center",
            )}
          >
            {children}
          </div>
        ) : null}
      </Container>
    </section>
  );
}
