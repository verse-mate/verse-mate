"use client";

import styles from "./MobileGlobal.module.css";

export default function MobileGlobal() {
  return (
    <section
      className={`${styles.section} mx-auto flex max-w-full flex-col items-center gap-12 self-stretch bg-white p-12 px-6`}
    >
      {/* Title */}
      <div
        className={`${styles.titleBorder} flex flex-row items-center justify-center gap-2 p-0 py-2`}
      >
        <span
          className={`${styles.titleText} whitespace-nowrap text-center font-inter font-bold uppercase text-brand-dark-gray`}
        >
          Global and Growing
        </span>
      </div>

      {/* Content */}
      <div
        className={`${styles.content} flex flex-col items-center justify-center gap-8 self-stretch p-0`}
      >
        {/* Icons */}
        <div className={`${styles.icon}`} />

        {/* Text */}
        <div
          className={`${styles.textGroup} flex flex-col items-center gap-4 self-stretch p-0`}
        >
          {/* Main Heading */}
          <h2
            className={`${styles.heading} m-0 self-stretch text-center font-merriweather font-bold text-brand-black`}
          >
            Built Worldwide. Anchored in the Word.
          </h2>

          {/* Description Text */}
          <div
            className={`${styles.descriptionContainer} flex flex-col gap-4 self-stretch`}
          >
            <p
              className={`${styles.descriptionText} m-0 text-center font-inter font-light text-brand-slate`}
            >
              Versemate is powered by believers across the globe - developers,
              translators, and thinkers working together in faith.
            </p>

            <p
              className={`${styles.descriptionText} m-0 text-center font-inter font-light text-brand-slate`}
            >
              Our tools are modern. Our foundation is eternal.
            </p>

            <p
              className={`${styles.descriptionText} m-0 text-center font-inter font-light text-brand-slate`}
            >
              Together, we're helping more people encounter Scripture clearly,
              every day, in every language.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
