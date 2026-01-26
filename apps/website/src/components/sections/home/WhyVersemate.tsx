import styles from "./WhyVersemate.module.css";

export default function WhyVersemate() {
  return (
    <section className={`${styles.section} w-full self-stretch`}>
      {/* Content Container - responsive with max-width */}
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col items-start gap-8 px-6 py-12 md:gap-12 md:px-12 md:py-16 lg:gap-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24">
        {/* Title */}
        <div className="flex flex-row items-center justify-center gap-2 border-b-4 border-brand-tan px-0 py-2 md:border-b-[6px] w-fit">
          <span className="whitespace-nowrap font-inter text-lg font-bold uppercase leading-6 tracking-[0.1em] text-white md:text-xl md:leading-7 lg:text-2xl lg:leading-8">
            Why Versemate
          </span>
        </div>

        {/* Text */}
        <div className="flex w-full max-w-[520px] flex-col items-start gap-4 p-0">
          {/* Main Heading */}
          <h2 className="w-full self-stretch font-merriweather text-3xl font-bold leading-[40px] text-white md:text-4xl md:leading-[48px] lg:text-5xl lg:leading-[64px]">
            Not Just Read - Understood.
          </h2>

          {/* Description Text */}
          <div className="w-full self-stretch font-inter text-base font-normal leading-6 text-white md:text-lg md:leading-7 lg:text-xl lg:leading-8 xl:text-2xl space-y-4">
            <p className="m-0">
              Too many people walk away from the Bible confused or overwhelmed.
            </p>
            <p className="m-0">
              Versemate was created to change that. We believe the Word of God was meant to be understood - not just read.
            </p>
            <p className="m-0">
              That&rsquo;s why we built a free, accessible platform that uses modern tools to explain timeless Scripture with clarity and faithfulness.
            </p>
            <p className="m-0">
              No paywalls. No clutter. Just the truth of God&rsquo;s Word, made simple.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
