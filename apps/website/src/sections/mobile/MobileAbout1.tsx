"use client";

import styles from "./MobileAbout1.module.css";

export default function MobileAbout1() {
  return (
    <section
      className={`${styles.section} mx-auto flex max-w-full flex-col items-center gap-12 self-stretch bg-white p-12 px-6`}
    >
      {/* Title */}
      <div
        className={`${styles.titleBorder} flex flex-row items-center justify-center gap-2 p-0 py-2`}
      >
        <span
          className={`${styles.titleText} text-center font-inter font-bold uppercase text-brand-dark-gray`}
        >
          About
        </span>
      </div>

      {/* Content */}
      <div
        className={`${styles.content} flex flex-col items-start justify-center gap-8 self-stretch p-0`}
      >
        {/* Image */}
        <div
          className={`${styles.image} self-stretch`}
        />

        {/* Text */}
        <div
          className={`${styles.textGroup} flex flex-col items-start justify-center gap-4 self-stretch p-0`}
        >
          {/* Main Heading */}
          <h2
            className={`${styles.heading} m-0 self-stretch font-merriweather font-bold text-brand-black`}
          >
            Built by Believers. Guided by the Word.
          </h2>

          {/* Description Text */}
          <div
            className={`${styles.descriptionContainer} flex flex-col gap-0 self-stretch`}
          >
            <p
              className={`${styles.descriptionText} m-0 font-inter font-light text-brand-slate`}
            >
              Versemate is a nonprofit organization on a mission to make the
              Bible easier to understand, study, and love - for everyone,
              everywhere.
            </p>
            <p
              className={`${styles.descriptionText} ${styles.paragraph2} font-inter font-light text-brand-slate`}
            >
              We are developers, translators, and believers from around the
              world, united by one calling: to help more people connect with God
              through His Word.
            </p>
            <p
              className={`${styles.descriptionText} m-0 font-inter font-light text-brand-slate`}
            >
              To make the Word of God easy to understand, deeply accessible, and
              free to everyone - so more people around the world can encounter
              Scripture, grow in faith, and walk closer with Christ.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
