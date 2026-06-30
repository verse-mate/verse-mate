import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import styles from "./About2.module.css";

export default function About2() {
  return (
    <Section className="bg-brand-light-cream">
      <div className="flex w-full flex-col items-center gap-10 lg:flex-row lg:gap-16">
        <Reveal className="flex w-full flex-col gap-5 lg:flex-1">
          <h2 className="m-0 font-merriweather text-section-title text-brand-black">
            Illuminating{" "}
            <span className="italic text-brand-tan-hover">God&rsquo;s Word</span>{" "}
            for Everyone
          </h2>

          <p className="m-0 font-inter text-body-lg text-brand-slate">
            We believe the Bible isn&rsquo;t just for scholars or clergy -
            it&rsquo;s for everyone. Whether you&rsquo;re discovering Scripture
            for the first time or leading a study group, Versemate helps
            illuminate God&rsquo;s Word for real understanding and lasting
            transformation.
          </p>
        </Reveal>

        <Reveal delayMs={120} className="flex w-full justify-center lg:w-auto lg:flex-shrink-0">
          <div
            className={`${styles.image} w-full max-w-[400px] rounded-[40px] md:max-w-[450px] lg:w-[480px] lg:max-w-none`}
          />
        </Reveal>
      </div>
    </Section>
  );
}
