import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import Reveal from "@/components/ui/Reveal";
import styles from "./Global.module.css";

export default function Global() {
  return (
    <Section
      className="bg-white"
      containerClassName="flex flex-col items-center gap-12 md:gap-16"
    >
      <Reveal className="flex flex-col items-center">
        <Eyebrow>Global and Growing</Eyebrow>
      </Reveal>

      <div className="flex w-full flex-col items-center gap-10 lg:flex-row lg:justify-center lg:gap-16">
        <Reveal className="flex justify-center">
          <div className={`${styles.icon} flex-shrink-0`} />
        </Reveal>

        <Reveal delayMs={120} className="flex flex-1 flex-col items-center gap-4 lg:items-end">
          <h2 className="m-0 w-full text-center font-merriweather text-section-title text-brand-black lg:text-right">
            Built <span className="italic text-brand-tan-hover">Worldwide.</span>{" "}
            Anchored in the Word.
          </h2>

          <div className="flex w-full flex-col gap-4 text-center font-inter text-body-lg text-brand-slate lg:text-right">
            <p className="m-0">
              Versemate is powered by believers across the globe - developers,
              translators, and thinkers working together in faith.
            </p>
            <p className="m-0">Our tools are modern. Our foundation is eternal.</p>
            <p className="m-0">
              Together, we&rsquo;re helping more people encounter Scripture
              clearly, every day, in every language.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
