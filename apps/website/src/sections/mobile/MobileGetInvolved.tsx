"use client";

import Link from "next/link";
import styles from "./MobileGetInvolved.module.css";

export default function MobileGetInvolved() {
  return (
    <section
      className={`${styles.section} mx-auto flex max-w-full flex-col items-center gap-12 self-stretch bg-dark-gradient p-12 px-6`}
    >
      {/* Title */}
      <div
        className={`${styles.titleBorder} flex flex-row items-center justify-center gap-2 p-0 py-2`}
      >
        <span
          className={`${styles.titleText} whitespace-nowrap text-center font-inter font-bold uppercase text-white`}
        >
          Get Involved
        </span>
      </div>

      {/* Group of cards */}
      <div
        className={`${styles.cardGroup} flex flex-col items-start gap-10 self-stretch p-0`}
      >
        {/* Volunteer */}
        <div
          className={`${styles.volunteerCard} flex flex-col items-center gap-6 self-stretch p-0`}
        >
          {/* Volunteer Title */}
          <h2
            className={`${styles.cardTitle} m-0 self-stretch text-center font-merriweather font-bold text-white`}
          >
            Volunteer
          </h2>

          {/* Content */}
          <div
            className={`${styles.cardContent} ${styles.volunteerContent} flex flex-col items-center gap-10 self-stretch pb-10`}
          >
            {/* Image */}
            <div
              className={`${styles.cardImage} ${styles.volunteerImage} self-stretch`}
            />

            {/* Text */}
            <div
              className={`${styles.cardText} ${styles.volunteerText} flex flex-col items-start gap-4 self-stretch`}
            >
              <h3
                className={`${styles.cardHeading} ${styles.volunteerHeading} m-0 self-stretch text-center font-inter font-bold text-white`}
              >
                Want to Help People Understand the Bible?
              </h3>
              <p
                className={`${styles.cardDescription} m-0 self-stretch text-center font-inter font-light text-white`}
              >
                We're looking for developers, testers, translators, and people
                of faith who want to make an eternal impact.
              </p>
            </div>

            {/* Button Container */}
            <div
              className={`${styles.buttonWrapper} flex flex-col items-start gap-2 self-stretch`}
            >
              <Link
                href="/volunteer"
                className={`${styles.button} flex flex-row items-center justify-center gap-2 self-stretch p-6 px-6 py-4 no-underline`}
              >
                <span
                  className={`${styles.buttonText} ${styles.volunteerButtonText} font-inter font-semibold text-black`}
                >
                  Join the Volunteer Team
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Give */}
        <div
          className={`${styles.giveCard} flex flex-col items-center gap-6 self-stretch p-0`}
        >
          {/* Give Title */}
          <h2
            className={`${styles.cardTitle} m-0 self-stretch text-center font-merriweather font-bold text-white`}
          >
            Give
          </h2>

          {/* Content */}
          <div
            className={`${styles.cardContent} ${styles.giveContent} flex flex-col items-center gap-10 self-stretch pb-10`}
          >
            {/* Image */}
            <div
              className={`${styles.cardImage} ${styles.giveImage} self-stretch`}
            />

            {/* Text */}
            <div
              className={`${styles.cardText} ${styles.giveText} flex flex-col items-start gap-4 self-stretch`}
            >
              <h3
                className={`${styles.cardHeading} ${styles.giveHeading} m-0 self-stretch text-center font-inter font-bold text-white`}
              >
                Believe in the Mission?
              </h3>
              <p
                className={`${styles.cardDescription} m-0 self-stretch text-center font-inter font-light text-white`}
              >
                Your gift keeps Versemate 100% free and accessible to people
                around the world seeking to understand God's Word.
              </p>
            </div>

            {/* Button Container */}
            <div
              className={`${styles.buttonWrapper} flex flex-col items-start gap-2 self-stretch`}
            >
              <Link
                href="/give"
                className={`${styles.button} flex flex-row items-center justify-center gap-2 self-stretch p-6 px-6 py-4 no-underline`}
              >
                <span
                  className={`${styles.buttonText} ${styles.giveButtonText} font-inter font-semibold text-black`}
                >
                  Make a Donation
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom text */}
        <div
          className={`${styles.bottomTextGroup} flex flex-col items-start gap-0 self-stretch p-0`}
        >
          <p
            className={`${styles.nonprofitText} self-stretch text-center font-inter font-medium text-brand-tan`}
          >
            Versemate is a 501(c)(3) nonprofit making the
            <br />
            Bible easier to understand - for everyone, forever.
          </p>
          <p
            className={`${styles.taxText} m-0 self-stretch text-center font-inter font-light text-white`}
          >
            Donations are tax-deductible in the U.S.
            <br />
            Built by believers. Guided by the Word.
          </p>
        </div>
      </div>
    </section>
  );
}
