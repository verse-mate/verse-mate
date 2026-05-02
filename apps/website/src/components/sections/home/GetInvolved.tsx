import Link from "next/link";
import styles from "./GetInvolved.module.css";

export default function GetInvolved() {
  return (
    <section className="w-full self-stretch bg-dark-gradient py-12 md:py-16 lg:py-20 xl:py-24">
      {/* Content Container - full width background with centered content */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-12 px-6 md:gap-16 md:px-8 lg:gap-20 lg:px-12 xl:px-[120px]">
        {/* Title */}
        <div className="flex flex-row items-center justify-center gap-2 border-b-4 border-brand-tan px-0 py-2 md:border-b-[6px]">
          <span className="flex items-center justify-center whitespace-nowrap font-inter text-xl font-bold uppercase leading-8 tracking-[0.1em] text-brand-white md:text-2xl">
            Get Involved
          </span>
        </div>

        {/* Group of cards */}
        <div className="flex w-full max-w-[1200px] flex-col items-start gap-8 p-0 md:gap-12 lg:flex-row lg:gap-10 xl:gap-14">
          {/* Volunteer */}
          <div className="flex w-full flex-1 flex-col items-center gap-4 p-0 md:gap-6">
            {/* Volunteer Title */}
            <h2 className="w-full font-merriweather text-3xl font-bold leading-tight text-center text-brand-white md:text-4xl lg:text-5xl lg:leading-[64px]">
              Volunteer
            </h2>

            {/* Content */}
            <div className={`${styles.cardContent} flex w-full flex-col items-center gap-6 rounded-[30px] pb-12 pt-0 md:gap-8 md:rounded-[40px] md:pb-14 lg:gap-10 lg:rounded-[50px] lg:pb-16`}>
              {/* Image */}
              <div className={`${styles.cardImage} ${styles.volunteerImage} w-full`} />

              {/* Text */}
              <div className="flex w-full flex-col items-start gap-3 px-4 py-0 md:gap-4 md:px-6">
                <h3 className="w-full font-inter text-lg font-bold leading-7 text-center text-brand-white md:text-xl md:leading-8 lg:text-2xl">
                  Want to Help People Understand the Bible?
                </h3>

                <p className={`${styles.cardDescription} w-full font-inter text-lg font-normal leading-7 text-center text-brand-white md:text-xl md:leading-8 lg:text-2xl`}>
                  We&rsquo;re looking for developers, testers, translators, and
                  people of faith who want to make an eternal impact.
                </p>
              </div>

              {/* Button Container */}
              <div className="flex w-full flex-col items-center justify-center gap-2 px-6 py-0 md:px-12 lg:px-20 xl:px-[100px]">
                <Link
                  href="/volunteer"
                  className="flex w-full max-w-[360px] flex-row items-center justify-center gap-2 rounded-full bg-brand-tan px-8 py-4 no-underline md:px-10 md:py-5 lg:px-12 lg:py-6"
                >
                  <span className="font-inter text-base font-semibold leading-7 text-brand-black md:text-lg md:leading-8 lg:text-xl">
                    Join the Volunteer Team
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* Coach */}
          <div className="flex w-full flex-1 flex-col items-center gap-4 p-0 md:gap-6">
            {/* Coach Title */}
            <h2 className="w-full font-merriweather text-3xl font-bold leading-tight text-center text-brand-white md:text-4xl lg:text-5xl lg:leading-[64px]">
              Coach
            </h2>

            {/* Content */}
            <div className={`${styles.cardContent} flex w-full flex-col items-center gap-6 rounded-[30px] pb-12 pt-0 md:gap-8 md:rounded-[40px] md:pb-14 lg:gap-10 lg:rounded-[50px] lg:pb-16`}>
              {/* Image */}
              <div className={`${styles.cardImage} ${styles.coachImage} w-full`} />

              {/* Text */}
              <div className="flex w-full flex-col items-start gap-3 px-4 py-0 md:gap-4 md:px-6">
                <h3 className="w-full font-inter text-lg font-bold leading-7 text-center text-brand-white md:text-xl md:leading-8 lg:text-2xl">
                  Are You a Bible Leader?
                </h3>

                <p className={`${styles.cardDescription} w-full font-inter text-lg font-normal leading-7 text-center text-brand-white md:text-xl md:leading-8 lg:text-2xl`}>
                  Weekly structured feedback across 11 dimensions that sharpens
                  your teaching, deepens your small groups, and strengthens your
                  ministry.
                </p>
              </div>

              {/* Button Container */}
              <div className="flex w-full flex-col items-center justify-center gap-2 px-6 py-0 md:px-12 lg:px-20 xl:px-[100px]">
                <Link
                  href="/coach"
                  className="flex w-full max-w-[360px] flex-row items-center justify-center gap-2 rounded-full bg-brand-tan px-8 py-4 no-underline md:px-10 md:py-5 lg:px-12 lg:py-6"
                >
                  <span className="font-inter text-base font-semibold leading-7 text-brand-black md:text-lg md:leading-8 lg:text-xl">
                    Request Coaching
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* Give */}
          <div className="flex w-full flex-1 flex-col items-center gap-4 p-0 md:gap-6">
            {/* Give Title */}
            <h2 className="w-full font-merriweather text-3xl font-bold leading-tight text-center text-brand-white md:text-4xl lg:text-5xl lg:leading-[64px]">
              Give
            </h2>

            {/* Content */}
            <div className={`${styles.cardContent} flex w-full flex-col items-center gap-6 rounded-[30px] pb-12 pt-0 md:gap-8 md:rounded-[40px] md:pb-14 lg:gap-10 lg:rounded-[50px] lg:pb-16`}>
              {/* Image */}
              <div className={`${styles.cardImage} ${styles.giveImage} w-full`} />

              {/* Text */}
              <div className="flex w-full flex-col items-start gap-3 px-4 py-0 md:gap-4 md:px-6">
                <h3 className="w-full font-inter text-lg font-bold leading-7 text-center text-brand-white md:text-xl md:leading-8 lg:text-2xl">
                  Believe in the Mission?
                </h3>

                <p className={`${styles.cardDescription} w-full font-inter text-lg font-normal leading-7 text-center text-brand-white md:text-xl md:leading-8 lg:text-2xl`}>
                  Your gift keeps Versemate 100% free and accessible to people
                  around the world seeking to understand God&rsquo;s Word.
                </p>
              </div>

              {/* Button Container */}
              <div className="flex w-full flex-col items-center justify-center gap-2 px-6 py-0 md:px-12 lg:px-20 xl:px-[100px]">
                <Link
                  href="/give"
                  className="flex w-full max-w-[360px] flex-row items-center justify-center gap-2 rounded-full bg-brand-tan px-8 py-4 no-underline md:px-10 md:py-5 lg:px-12 lg:py-6"
                >
                  <span className="font-inter text-base font-semibold leading-7 text-brand-black md:text-lg md:leading-8 lg:text-xl">
                    Make a Donation
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom text */}
        <div className="flex w-full max-w-[1200px] flex-col items-start gap-4 p-0 md:gap-6">
          <p className="w-full font-inter text-lg font-medium leading-7 text-center text-brand-tan md:text-xl md:leading-8">
            Versemate is a 501(c)(3) nonprofit making the Bible easier to
            understand—for everyone, forever.
          </p>

          <p className={`${styles.bottomText2} w-full font-inter text-sm font-light leading-6 text-center text-brand-white md:text-base`}>
            Donations are tax-deductible in the U.S. | Built by believers. Guided
            by the Word.
          </p>
        </div>
      </div>
    </section>
  );
}
