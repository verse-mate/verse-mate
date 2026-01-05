"use client";

import styles from "./MobileAbout2.module.css";

export default function MobileAbout2() {
  return (
    <section
      className={`${styles.section} isolate mx-auto flex max-w-full flex-col items-center justify-center gap-8 self-stretch bg-brand-light-cream p-12 px-6`}
    >
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
            className={`${styles.heading} m-0 self-stretch text-left font-merriweather font-bold text-brand-black`}
            style={{
              wordWrap: "break-word",
              hyphens: "none",
            }}
          >
            Illuminating God's
            <br />
            Word for Everyone
          </h2>

          {/* Description Text */}
          <div
            className={`${styles.descriptionContainer} flex flex-col gap-4 self-stretch`}
          >
            <p
              className={`${styles.descriptionText} m-0 font-inter font-light text-brand-slate`}
            >
              We believe the Bible isn't just for scholars or clergy - it's for
              everyone. Whether you're discovering Scripture for the first time
              or leading a study group, Versemate helps illuminate God's Word
              for real understanding and lasting transformation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
