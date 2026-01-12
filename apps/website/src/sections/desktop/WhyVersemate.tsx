import styles from "./WhyVersemate.module.css";

export default function WhyVersemateSection() {
  return (
    <section className={`${styles.section} w-full self-stretch`}>
      {/* Content Container - responsive with max-width */}
      <div
        className={`${styles.contentContainer} mx-auto flex h-full w-full max-w-[1440px] flex-col items-start gap-8 px-6 py-12 md:gap-12 md:px-12 md:py-16 lg:gap-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24`}
      >
        {/* Title */}
        <div
          className={`${styles.title} flex w-full max-w-[242px] flex-row items-center justify-center gap-2 border-b-4 border-brand-tan px-0 py-2 md:border-b-[6px]`}
        >
          <span className={`${styles.titleText} w-full font-inter text-lg font-bold uppercase leading-6 tracking-[0.1em] text-brand-white md:text-xl md:leading-7 lg:text-2xl lg:leading-8`}>
            Why Versemate
          </span>
        </div>

        {/* Text */}
        <div className={`${styles.textContent} flex w-full max-w-[520px] flex-col items-start gap-4 p-0`}>
          {/* Main Heading */}
          <h2 className={`${styles.heading} w-full self-stretch font-merriweather text-3xl font-bold leading-[40px] text-brand-white md:text-4xl md:leading-[48px] lg:text-5xl lg:leading-[64px]`}>
            Not Just Read - Understood.
          </h2>

          {/* Description Text */}
          <p className={`${styles.description} w-full self-stretch font-inter text-base font-normal leading-6 text-brand-white md:text-lg md:leading-7 lg:text-xl lg:leading-8 xl:text-2xl`}>
            Too many people walk away from the Bible
            <br />
            confused or over whelmed.
            <br />
            <br />
            Versemate was created to change that.
            <br />
            We believe the Word of God was meant to be
            <br />
            understood - not just read.
            <br />
            <br />
            That&rsquo;s why we built a free, accessible
            <br />
            platform t hat uses modern tools to explain
            <br />
            timeless Scripture with clarity and
            <br />
            fait hfulness .<br />
            <br />
            No paywalls. No clutter. Just the truth of
            <br />
            God&rsquo;s Word, made simple.
          </p>
        </div>
      </div>
    </section>
  );
}
