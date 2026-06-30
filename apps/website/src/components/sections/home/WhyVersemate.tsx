import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import Reveal from "@/components/ui/Reveal";
import styles from "./WhyVersemate.module.css";

export default function WhyVersemate() {
  return (
    <Section
      className={`${styles.section} flex items-center`}
      containerClassName="flex flex-col items-start gap-8"
    >
      <Reveal className="flex flex-col items-start gap-8">
        <Eyebrow variant="light">Why Versemate</Eyebrow>

        <div className="flex max-w-[560px] flex-col items-start gap-5">
          <h2 className="m-0 font-merriweather text-section-title text-white">
            Not Just Read -{" "}
            <span className="italic text-brand-tan">Understood.</span>
          </h2>

          <div className="flex flex-col gap-4 font-inter text-body-lg text-white/90">
            <p className="m-0">
              Too many people walk away from the Bible confused or overwhelmed.
            </p>
            <p className="m-0">
              Versemate was created to change that. We believe the Word of God
              was meant to be understood - not just read.
            </p>
            <p className="m-0">
              That&rsquo;s why we built a free, accessible platform that uses
              modern tools to explain timeless Scripture with clarity and
              faithfulness.
            </p>
            <p className="m-0">
              No paywalls. No clutter. Just the truth of God&rsquo;s Word, made
              simple.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
