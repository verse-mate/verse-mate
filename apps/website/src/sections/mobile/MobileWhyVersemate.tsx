"use client";

import styles from "./MobileWhyVersemate.module.css";

export default function MobileWhyVersemate() {
  return (
    <section
      className={`${styles.section} relative isolate mx-auto flex max-w-full flex-col items-start gap-12 overflow-hidden p-12 px-6`}
    >
      {/* Image */}
      <div className={`${styles.imageContainer}`}>
        {/* Background Image */}
        <div className={`${styles.backgroundImage}`} />

        {/* Overlay */}
        <div className={`${styles.overlay}`} />
      </div>

      {/* Title */}
      <div
        className={`${styles.titleBorder} flex flex-row items-center justify-center gap-2 p-0 py-2`}
      >
        <span
          className={`${styles.titleText} text-center font-inter font-bold uppercase text-white`}
        >
          WHY VERSEMATE
        </span>
      </div>

      {/* Text */}
      <div
        className={`${styles.textContent} flex flex-col items-start gap-4 self-stretch p-0`}
      >
        {/* Main Heading */}
        <h2
          className={`${styles.heading} m-0 self-stretch font-merriweather font-bold text-white`}
        >
          Not Just Read - Understood.
        </h2>

        {/* Description Text */}
        <div
          className={`${styles.descriptionContainer} flex flex-col gap-4 self-stretch`}
        >
          <p
            className={`${styles.descriptionText} m-0 font-inter font-light text-white`}
          >
            Too many people walk away from the Bible confused or overwhelmed.
          </p>

          <p
            className={`${styles.descriptionText} m-0 font-inter font-light text-white`}
          >
            Versemate was created to change that. We believe the Word of God was
            meant to be understood - not just read.
          </p>

          <p
            className={`${styles.descriptionText} m-0 font-inter font-light text-white`}
          >
            That's why we built a free, accessible platform that uses modern
            tools to explain timeless Scripture with clarity and faithfulness.
          </p>

          <p
            className={`${styles.descriptionText} m-0 font-inter font-light text-white`}
          >
            No paywalls. No clutter. Just the truth of God's Word, made simple.
          </p>
        </div>
      </div>
    </section>
  );
}
