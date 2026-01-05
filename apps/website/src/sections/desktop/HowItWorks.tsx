import styles from "./HowItWorks.module.css";

export default function HowItWorksSection() {
  return (
    <section
      className="w-full self-stretch bg-light-radial py-12 md:py-16 lg:py-24"
    >
      {/* Content Container - responsive with max width */}
      <div
        className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-8 px-6 md:gap-12 md:px-8 lg:gap-16 lg:px-16 xl:px-[120px]"
      >
        {/* Title */}
        <div
          className="flex flex-row items-center justify-center gap-2 border-b-[6px] border-brand-tan px-0 py-2"
        >
          <span className="font-inter text-xl font-bold uppercase leading-7 tracking-[0.1em] text-brand-dark-gray md:text-2xl md:leading-8">
            HOW IT WORKS?
          </span>
        </div>

        {/* Content */}
        <div className="flex w-full max-w-[1200px] flex-col items-start gap-12 p-0 md:gap-16 lg:gap-20">
          {/* Text group */}
          <div className="flex w-full flex-col items-center gap-4 px-0 py-0 md:px-6 lg:px-12">
            <h2 className="m-0 w-full max-w-[676px] text-center font-merriweather text-3xl font-bold leading-tight text-brand-black md:text-4xl md:leading-snug lg:text-5xl lg:leading-[64px]">
              Explore Scripture Your Way.
            </h2>

            <p className="w-full max-w-[1104px] text-center font-inter text-lg font-normal leading-7 text-brand-slate md:text-xl md:leading-8 lg:text-2xl">
              Whether you're new to the Word or someone looking to dive deeper,
              Versemate gives you the clarity and depth you need - to grow in
              faith and understanding.
            </p>
          </div>

          {/* Images and description */}
          <div className="flex w-full flex-col items-center gap-12 p-0 lg:flex-row lg:items-center lg:gap-16 xl:gap-20">
            {/* Images */}
            <div className={`${styles.imagesContainer} relative w-full max-w-[706px] lg:w-1/2`}>
              {/* Summary */}
              <div className={`${styles.summaryImage} absolute flex flex-col items-start gap-2 p-1`}>
                <div className={`${styles.summaryImageInner} self-stretch flex-1 rounded-2xl`} />
              </div>

              {/* Line by Line */}
              <div className={`${styles.lineByLineImage} absolute flex flex-col items-start gap-2 p-1`}>
                <div className={`${styles.lineByLineImageInner} self-stretch flex-1 rounded-2xl`} />
              </div>

              {/* Detailed */}
              <div className={`${styles.detailedImage} absolute flex flex-col items-start gap-2 p-1`}>
                <div className={`${styles.detailedImageInner} self-stretch flex-1 rounded-2xl`} />
              </div>
            </div>

            {/* Description */}
            <div className="flex w-full max-w-[414px] flex-1 flex-col items-start gap-12 p-0 md:gap-16 lg:w-1/2 lg:gap-20">
              {/* Summary View */}
              <div className="flex w-full flex-col items-start gap-2 rounded-[20px] p-0">
                <h3 className="w-full font-inter text-xl font-bold leading-7 text-brand-dark-gray md:text-2xl md:leading-8">
                  Summary View
                </h3>

                <p className="w-full font-inter text-lg font-normal leading-7 text-brand-slate md:text-xl md:leading-8 lg:text-2xl">
                  Get a summary, line-by-line breakdown, or in-depth analysis.
                </p>
              </div>

              {/* Line by Line */}
              <div className="flex w-full flex-col items-start gap-2 rounded-[20px] p-0">
                <h3 className="w-full font-inter text-xl font-bold leading-7 text-brand-dark-gray md:text-2xl md:leading-8">
                  Line by Line
                </h3>

                <p className="w-full font-inter text-lg font-normal leading-7 text-brand-slate md:text-xl md:leading-8 lg:text-2xl">
                  Thoughtful commentary for every verse - perfect for learning,
                  reflecting, and growing in faith.
                </p>
              </div>

              {/* In-Depth Study */}
              <div className="flex w-full flex-col items-start gap-2 rounded-[20px] p-0">
                <h3 className="w-full font-inter text-xl font-bold leading-7 text-brand-dark-gray md:text-2xl md:leading-8">
                  In-Depth Study
                </h3>

                <p className="w-full font-inter text-lg font-normal leading-7 text-brand-slate md:text-xl md:leading-8 lg:text-2xl">
                  Rich theological insight with context, cross-references, and
                  language tools - built for serious Bible study.
                </p>
              </div>
            </div>
          </div>

          {/* Text Line */}
          <p className="w-full text-center font-inter text-lg font-medium leading-7 text-brand-dark-gray md:text-xl md:leading-8">
            Available in multiple Bible versions and languages - so anyone,
            anywhere, can understand the truth.
          </p>
        </div>
      </div>
    </section>
  );
}
