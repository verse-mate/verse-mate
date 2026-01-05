import styles from "./HowItWorks.module.css";

export default function HowItWorks() {
  return (
    <section className={`${styles.section} flex flex-col self-stretch items-center gap-16 bg-light-radial px-16 py-24`}>
      {/* Title */}
      <div className={`${styles.title} flex flex-row items-center justify-center gap-2 border-b-[6px] border-brand-tan px-0 py-2`}>
        <h2 className={`${styles.titleText} font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-brand-dark-gray`}>
          How It Works?
        </h2>
      </div>

      {/* Content */}
      <div className={`${styles.content} flex flex-col self-stretch items-start gap-20 p-0`}>
        {/* Text group */}
        <div className={`${styles.textGroup} flex flex-col self-stretch items-center gap-4 px-12 py-0`}>
          {/* Main Heading */}
          <h1 className={`${styles.heading} font-merriweather text-5xl font-bold leading-[64px] text-brand-black`}>
            Explore Scripture Your Way.
          </h1>

          {/* Description */}
          <p className={`${styles.description} self-stretch font-inter text-2xl font-normal leading-8 text-center text-brand-slate`}>
            Whether you&rsquo;re new to the Word or someone looking to dive deeper, Versemate gives you the clarity and depth you need - to grow in faith and understanding.
          </p>
        </div>

        {/* Images and description */}
        <div className={`${styles.imagesSection} flex flex-col self-stretch items-start justify-center gap-20 p-0`}>
          {/* Frame 1 - Images Container */}
          <div className={`${styles.imagesContainer} relative self-stretch`}>
            {/* Summary */}
            <div className={`${styles.summaryImage} absolute`} />

            {/* By Line */}
            <div className={`${styles.lineByLineImage} absolute`} />

            {/* Detailed */}
            <div className={`${styles.detailedImage} absolute`} />
          </div>

          {/* Description */}
          <div className={`${styles.descriptionsContainer} flex flex-col self-stretch items-start gap-10 p-0`}>
            {/* Summary View */}
            <div className={`${styles.featureBlockSummary} flex flex-col self-stretch items-start gap-2 rounded-[20px] p-0`}>
              <h3 className={`${styles.featureTitle} ${styles.featureTitleSummary} self-stretch font-inter text-2xl font-bold leading-8 text-brand-dark-gray`}>
                Summary View
              </h3>
              <p className={`${styles.featureDescription} ${styles.featureDescriptionSummary} self-stretch font-inter text-2xl font-normal leading-8 text-brand-slate`}>
                Get a summary, line-by-line breakdown, or in-depth analysis.
              </p>
            </div>

            {/* Line by Line */}
            <div className={`${styles.featureBlockLineByLine} flex flex-col self-stretch items-start gap-2 rounded-[20px] p-0`}>
              <h3 className={`${styles.featureTitle} ${styles.featureTitleLineByLine} self-stretch font-inter text-2xl font-bold leading-8 text-brand-dark-gray`}>
                Line by Line
              </h3>
              <p className={`${styles.featureDescription} ${styles.featureDescriptionLineByLine} self-stretch font-inter text-2xl font-normal leading-8 text-brand-slate`}>
                Thoughtful commentary for every verse - perfect for learning, reflecting, and growing in faith.
              </p>
            </div>

            {/* In-Depth Study */}
            <div className={`${styles.featureBlockDetailed} flex flex-col self-stretch items-start gap-2 rounded-[20px] p-0`}>
              <h3 className={`${styles.featureTitle} ${styles.featureTitleDetailed} self-stretch font-inter text-2xl font-bold leading-8 text-brand-dark-gray`}>
                In-Depth Study
              </h3>
              <p className={`${styles.featureDescription} ${styles.featureDescriptionDetailed} self-stretch font-inter text-2xl font-normal leading-8 text-brand-slate`}>
                Rich theological insight with context, cross-references, and language tools - built for serious Bible study.
              </p>
            </div>
          </div>
        </div>

        {/* Text Line */}
        <p className={`${styles.bottomText} self-stretch font-inter text-xl font-medium leading-8 text-center text-brand-dark-gray`}>
          Available in multiple Bible versions and languages - so anyone,
          anywhere, can understand the truth.
        </p>
      </div>
    </section>
  );
}
