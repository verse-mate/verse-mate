import Link from "next/link";
import styles from "./GetInvolved.module.css";

export default function GetInvolved() {
  return (
    <section
      className={`${styles.getInvolvedSection} z-[4] flex flex-none flex-col items-center gap-16 bg-dark-gradient px-16 py-24`}
    >
      {/* Title */}
      <div
        className={`${styles.titleContainer} flex flex-none flex-row items-center justify-center gap-2 border-b-[6px] border-brand-gold px-0 py-2`}
      >
        <h2
          className={`${styles.title} flex-none text-center font-inter font-bold uppercase tracking-[0.1em] text-white`}
        >
          Get Involved
        </h2>
      </div>

      {/* Group of cards */}
      <div
        className={`${styles.cardsContainer} flex flex-none flex-row items-start self-stretch gap-10 p-0`}
      >
        {/* Volunteer Card */}
        <div
          className={`${styles.card} flex flex-none grow flex-col items-center gap-6 p-0`}
        >
          {/* Volunteer Title */}
          <h3
            className={`${styles.cardTitle} flex-none self-stretch text-center font-merriweather font-bold text-white`}
          >
            Volunteer
          </h3>

          {/* Content */}
          <div
            className={`${styles.cardContent} flex flex-none flex-col items-center self-stretch gap-10 rounded-[50px] bg-white/10 pb-16 shadow-[0_4px_4px_rgba(0,0,0,0.25)]`}
          >
            {/* Image */}
            <div
              className={`${styles.volunteerImage} flex-none self-stretch rounded-none`}
            />

            {/* Text */}
            <div
              className={`${styles.cardTextContainer} flex flex-none flex-col items-start self-stretch gap-4 px-6`}
            >
              <h4
                className={`${styles.cardHeading} flex-none self-stretch text-center font-inter font-bold text-white`}
              >
                Want to Help People Understand the Bible?
              </h4>

              <p
                className={`${styles.cardDescription} flex-none self-stretch text-center font-inter font-light text-white opacity-50`}
              >
                We&rsquo;re looking for developers, testers, translators, and people of faith who want to make an eternal impact.
              </p>
            </div>

            {/* Button Container */}
            <div
              className={`${styles.buttonContainer} flex flex-none flex-col items-start self-stretch gap-2 px-8`}
            >
              <Link
                href="/volunteer"
                className={`${styles.button} flex flex-none flex-row items-center justify-center self-stretch gap-2 rounded-full bg-brand-gold px-12 py-6 no-underline`}
              >
                <span
                  className={`${styles.volunteerButtonText} flex-none font-inter font-medium text-black`}
                >
                  Join the Volunteer Team
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Give Card */}
        <div
          className={`${styles.card} flex flex-none grow flex-col items-center self-stretch gap-6 p-0`}
        >
          {/* Give Title */}
          <h3
            className={`${styles.cardTitle} flex-none self-stretch text-center font-merriweather font-bold text-white`}
          >
            Give
          </h3>

          {/* Content */}
          <div
            className={`${styles.cardContent} flex flex-none grow flex-col items-center self-stretch gap-10 rounded-[50px] bg-white/10 pb-16`}
          >
            {/* Image */}
            <div
              className={`${styles.giveImage} flex-none self-stretch rounded-none`}
            />

            {/* Text */}
            <div
              className={`${styles.cardTextContainer} flex flex-none flex-col items-start justify-between self-stretch gap-4 px-6`}
            >
              <h4
                className={`${styles.cardGiveHeading} mx-auto flex-none self-stretch text-center font-inter font-bold text-white`}
              >
                Believe in the Mission?
              </h4>

              <p
                className={`${styles.cardDescription} mx-auto flex-none self-stretch text-center font-inter font-light text-white opacity-50`}
              >
                Your gift keeps Versemate 100% free and accessible to people around the world seeking to understand God&rsquo;s Word.
              </p>
            </div>

            {/* Button Container */}
            <div
              className={`${styles.buttonContainer} flex flex-none flex-col items-start self-stretch gap-2 px-8`}
            >
              <Link
                href="/give"
                className={`${styles.button} flex flex-none flex-row items-center justify-center self-stretch gap-2 rounded-full bg-brand-gold px-12 py-6 no-underline`}
              >
                <span
                  className={`${styles.giveButtonText} flex-none font-inter font-medium text-black`}
                >
                  Make a Donation
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom text */}
      <div
        className={`${styles.bottomTextContainer} flex flex-none flex-col items-start self-stretch gap-6 p-0`}
      >
        <p
          className={`${styles.bottomTextPrimary} flex-none self-stretch text-center font-inter font-normal text-brand-gold`}
        >
          Versemate is a 501(c)(3) nonprofit making the Bible easier to understand - for everyone, forever.
        </p>

        <p
          className={`${styles.bottomTextSecondary} flex-none self-stretch text-center font-inter font-extralight text-white opacity-50`}
        >
          Donations are tax-deductible in the U.S. | Built by believers. Guided by the Word.
        </p>
      </div>
    </section>
  );
}