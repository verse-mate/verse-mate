import styles from "./Global.module.css";

export default function Global() {
  return (
    <section
      className={`${styles.globalSection} z-[3] flex flex-none flex-col items-center self-stretch gap-16 bg-white px-16 py-24`}
    >
      {/* Title */}
      <div
        className={`${styles.titleContainer} flex flex-none flex-row items-center justify-center gap-2 border-b-[6px] border-brand-gold px-0 py-2`}
      >
        <h2
          className={`${styles.title} flex-none text-center font-inter font-bold uppercase tracking-[0.1em] text-brand-slate`}
        >
          Global And Growing
        </h2>
      </div>

      {/* Content */}
      <div
        className={`${styles.contentContainer} flex flex-none flex-row items-center justify-center self-stretch gap-16 p-0`}
      >
        {/* Icons */}
        <div
          className={`${styles.iconImage} flex-none`}
        />

        {/* Text */}
        <div
          className={`${styles.textContainer} flex flex-none grow flex-col items-end gap-4 p-0`}
        >
          {/* Main Heading */}
          <h1
            className={`${styles.heading} flex-none self-stretch font-merriweather font-semibold text-black`}
          >
            Built Worldwide. Anchored in the Word.
          </h1>

          {/* Description */}
          <p
            className={`${styles.description} flex-none self-stretch font-inter font-light text-brand-slate`}
          >
            Versemate is powered by believers across the globe - developers, translators, and thinkers working together in faith.
            <br /><br />
            Our tools are modern. Our foundation is eternal.
            <br /><br />
            Together, we&rsquo;re helping more people encounter Scripture clearly, every day, in every language.
          </p>
        </div>
      </div>
    </section>
  );
}