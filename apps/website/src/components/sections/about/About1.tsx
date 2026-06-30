import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import Reveal from "@/components/ui/Reveal";
import styles from "./About1.module.css";

type About1Props = {
  /** Heading level — "h1" when this is the page's main heading (e.g. /about),
   *  "h2" when it sits under a page hero (e.g. the home page). */
  as?: "h1" | "h2";
};

export default function About1({ as = "h2" }: About1Props) {
  const Heading = as;
  return (
    <Section
      className="bg-brand-white"
      containerClassName="flex flex-col items-center gap-12 md:gap-16"
    >
      <Reveal className="flex flex-col items-center">
        <Eyebrow>About</Eyebrow>
      </Reveal>

      <div className="flex w-full flex-col items-center gap-10 lg:flex-row lg:gap-16">
        <Reveal className="flex w-full justify-center lg:w-auto lg:flex-shrink-0">
          <div
            className={`${styles.image} aspect-square w-full max-w-[320px] rounded-[40px] md:max-w-[400px] lg:h-[440px] lg:w-[440px] lg:max-w-none xl:h-[480px] xl:w-[480px]`}
          />
        </Reveal>

        <Reveal delayMs={120} className="flex w-full flex-1 flex-col gap-5">
          <Heading className="m-0 font-merriweather text-section-title text-brand-black">
            Built by Believers.
            <br />
            Guided by <span className="italic text-brand-tan-hover">the Word.</span>
          </Heading>

          <div className="flex flex-col gap-4 font-inter text-body-lg text-brand-slate">
            <p className="m-0">
              Versemate is a nonprofit organization on a mission to make the
              Bible easier to understand, study, and love - for everyone,
              everywhere.
            </p>
            <p className="m-0">
              We are developers, translators, and believers from around the
              world, united by one calling: to help more people connect with God
              through His Word.
            </p>
            <p className="m-0">
              To make the Word of God easy to understand, deeply accessible, and
              free to everyone - so more people around the world can encounter
              Scripture, grow in faith, and walk closer with Christ.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
