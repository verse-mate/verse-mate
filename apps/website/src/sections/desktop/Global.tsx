import styles from "./Global.module.css";

export default function GlobalSection() {
  return (
    <section className={`${styles.section} w-full self-stretch bg-brand-white`}>
      {/* Content Container - maintains 1440px layout */}
      <div
        className={`${styles.contentContainer} mx-auto flex h-full flex-col items-center gap-16 px-[120px] py-24`}
      >
        {/* Title */}
        <div
          className={`${styles.title} flex flex-row items-center justify-center gap-2 border-b-[6px] border-brand-tan px-0 py-2`}
        >
          <span className={`${styles.titleText} flex items-center justify-center whitespace-nowrap font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-brand-dark-gray`}>
            Global and Growing
          </span>
        </div>

        {/* Content */}
        <div className={`${styles.content} flex flex-row items-center justify-center gap-16 p-0`}>
          {/* Icons */}
          <div className={`${styles.icon}`} />

          {/* Text */}
          <div className={`${styles.textContent} flex flex-1 flex-col items-end gap-4 p-0`}>
            {/* Main Heading */}
            <h2 className={`${styles.heading} self-stretch font-merriweather text-5xl font-bold leading-[64px] text-brand-black`}>
              Built Worldwide. Anchored in the Word.
            </h2>

            {/* Description Text */}
            <p className={`${styles.description} self-stretch font-inter text-2xl font-normal leading-8 text-brand-slate`}>
              Versemate is powered by believers across the globe - developers,
              translators, and thinkers working together in faith.
              <br />
              <br />
              Our tools are modern. Our foundation is eternal.
              <br />
              <br />
              Together, we&rsquo;re helping more people encounter Scripture
              clearly, every day, in every language.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
