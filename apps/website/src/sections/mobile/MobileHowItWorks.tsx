"use client";

import styles from "./MobileHowItWorks.module.css";

export default function MobileHowItWorks() {
  return (
    <section
      className={`${styles.section} mx-auto flex max-w-full flex-col items-center gap-12 self-stretch bg-light-radial p-12 px-6`}
    >
      {/* Title */}
      <div
        className={`${styles.titleBorder} flex flex-row items-center justify-center gap-2 p-0 py-2`}
      >
        <span
          className={`${styles.titleText} text-center font-inter font-bold uppercase text-brand-dark-gray`}
        >
          How it works?
        </span>
      </div>

      {/* Content */}
      <div
        className={`${styles.content} flex flex-col items-center gap-10 self-stretch p-0`}
      >
        {/* Text group */}
        <div
          className={`${styles.textGroup} flex flex-col items-center gap-4 self-stretch p-0`}
        >
          <h2
            className={`${styles.heading} m-0 self-stretch text-center font-merriweather font-bold text-brand-black`}
          >
            Explore Scripture
            <br />
            Your Way.
          </h2>
          <p
            className={`${styles.description} m-0 self-stretch text-center font-inter font-light text-brand-slate`}
          >
            Whether you're new to the Word or someone looking
            <br />
            to dive deeper, Versemate gives you the clarity and
            <br />
            depth you need - to grow in faith and
            <br />
            understanding.
          </p>
        </div>

        {/* Images and description */}
        <div
          className={`${styles.imagesAndDescription} flex flex-col items-center justify-center gap-10 self-stretch p-0`}
        >
          {/* Frame 1 */}
          <div
            className={`${styles.imageFrame} relative`}
          >
            {/* Summary */}
            <div
              className={`${styles.imageWrapper1} flex flex-col items-start`}
            >
              <div className={`${styles.image1}`} />
            </div>

            {/* By Line */}
            <div
              className={`${styles.imageWrapper2} flex flex-col items-start`}
            >
              <div className={`${styles.image2}`} />
            </div>

            {/* Detailed */}
            <div
              className={`${styles.imageWrapper3} flex flex-col items-start`}
            >
              <div className={`${styles.image3}`} />
            </div>
          </div>

          {/* Description */}
          <div
            className={`${styles.descriptionGroup} flex flex-col items-center gap-6 self-stretch p-0`}
          >
            {/* Summary View */}
            <div
              className={`${styles.featureCard1} flex flex-col items-start gap-2 self-stretch p-0`}
            >
              <h3
                className={`${styles.featureTitle} ${styles.featureTitle1} m-0 self-stretch font-inter font-bold text-brand-dark-gray`}
              >
                Summary View
              </h3>
              <p
                className={`${styles.featureText} ${styles.featureText1} m-0 self-stretch font-inter font-light text-brand-slate`}
              >
                Get a summary, line-by-line breakdown, or in-depth analysis.
              </p>
            </div>

            {/* Line by Line */}
            <div
              className={`${styles.featureCard2} flex flex-col items-start gap-2 self-stretch p-0`}
            >
              <h3
                className={`${styles.featureTitle} ${styles.featureTitle2} m-0 self-stretch font-inter font-bold text-brand-dark-gray`}
              >
                Line by Line
              </h3>
              <p
                className={`${styles.featureText} ${styles.featureText2} m-0 self-stretch font-inter font-light text-brand-slate`}
              >
                Thoughtful commentary for every verse - perfect for learning,
                reflecting, and growing in faith.
              </p>
            </div>

            {/* In-Depth Study */}
            <div
              className={`${styles.featureCard3} flex flex-col items-start gap-2 self-stretch p-0`}
            >
              <h3
                className={`${styles.featureTitle} ${styles.featureTitle3} m-0 self-stretch font-inter font-bold text-brand-dark-gray`}
              >
                In-Depth Study
              </h3>
              <p
                className={`${styles.featureText} ${styles.featureText3} m-0 self-stretch font-inter font-light text-brand-slate`}
              >
                Rich theological insight with context, cross-references, and
                language tools - built for serious Bible study.
              </p>
            </div>
          </div>
        </div>

        {/* Text Line */}
        <p
          className={`${styles.bottomText} m-0 self-stretch text-center font-inter font-medium text-brand-dark-gray`}
        >
          Available in multiple Bible versions and languages - so anyone,
          anywhere, can understand the truth.
        </p>
      </div>
    </section>
  );
}
