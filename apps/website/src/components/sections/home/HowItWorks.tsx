import Image from "next/image";
import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import Reveal from "@/components/ui/Reveal";

const FEATURES = [
  {
    title: "Summary View",
    body: "Get a summary, line-by-line breakdown, or in-depth analysis.",
  },
  {
    title: "Line by Line",
    body: "Thoughtful commentary for every verse - perfect for learning, reflecting, and growing in faith.",
  },
  {
    title: "In-Depth Study",
    body: "Rich theological insight with context, cross-references, and language tools - built for serious Bible study.",
  },
];

export default function HowItWorks() {
  return (
    <Section
      className="bg-light-radial"
      containerClassName="flex flex-col items-center gap-12 md:gap-16"
    >
      <Reveal className="flex flex-col items-center">
        <Eyebrow>HOW IT WORKS?</Eyebrow>
      </Reveal>

      <Reveal className="flex w-full flex-col items-center gap-4">
        <h2 className="m-0 max-w-[676px] text-center font-merriweather text-section-title text-brand-black">
          Explore Scripture{" "}
          <span className="italic text-brand-tan-hover">Your Way.</span>
        </h2>
        <p className="max-w-[720px] text-center font-inter text-body-lg text-brand-slate">
          Whether you&rsquo;re new to the Word or someone looking to dive deeper,
          Versemate gives you the clarity and depth you need - to grow in faith
          and understanding.
        </p>
      </Reveal>

      <div className="flex w-full flex-col items-center gap-12 lg:flex-row lg:gap-16 xl:gap-20">
        {/* Single pre-composed mockup (shadows baked in) */}
        <Reveal className="w-full lg:w-1/2">
          <Image
            src="/how-it-works.png"
            alt="VerseMate's Summary, Line-by-Line, and In-Depth views of Genesis 1"
            width={1492}
            height={1424}
            sizes="(max-width: 1024px) 92vw, 46vw"
            className="mx-auto h-auto w-full max-w-[640px]"
          />
        </Reveal>

        {/* Feature list */}
        <Reveal delayMs={120} className="flex w-full max-w-[460px] flex-col gap-8 lg:w-1/2 lg:gap-10">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-2">
              <h3 className="font-inter text-heading-3 text-brand-dark-gray">
                {feature.title}
              </h3>
              <p className="font-inter text-body text-brand-slate">
                {feature.body}
              </p>
            </div>
          ))}
        </Reveal>
      </div>

      <Reveal className="w-full">
        <p className="text-center font-inter text-body font-medium text-brand-dark-gray">
          Available in multiple Bible versions and languages - so anyone,
          anywhere, can understand the truth.
        </p>
      </Reveal>
    </Section>
  );
}
