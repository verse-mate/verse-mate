import styles from "./WhyVersemate.module.css";

export default function WhyVersemate() {
  return (
    <section className={`${styles.section} flex flex-col self-stretch items-start gap-16 px-16 py-24`}>
      {/* Title */}
      <div className={`${styles.title} flex flex-row items-center justify-center gap-2 border-b-[6px] border-brand-tan px-0 py-2`}>
        <h2 className={`${styles.titleText} font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-brand-white`}>
          Why Versemate
        </h2>
      </div>

      {/* Text */}
      <div className={`${styles.textContent} flex flex-col items-start gap-4 p-0`}>
        {/* Main Heading */}
        <h1 className={`${styles.heading} self-stretch font-merriweather text-5xl font-bold leading-[64px] text-brand-white`}>
          Not Just Read - Understood.
        </h1>

        {/* Description */}
        <p className={`${styles.description} self-stretch font-inter text-2xl font-normal leading-8 text-brand-white`}>
          Too many people walk away from the Bible confused or overwhelmed.
          <br /><br />
          Versemate was created to change that. We believe the Word of God was meant to be understood - not just read.
          <br /><br />
          That&rsquo;s why we built a free, accessible platform that uses modern tools to explain timeless Scripture with clarity and faithfulness.
          <br /><br />
          No paywalls. No clutter. Just the truth of God&rsquo;s Word, made simple.
        </p>
      </div>
    </section>
  );
}
