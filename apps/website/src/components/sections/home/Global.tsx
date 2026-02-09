import styles from "./Global.module.css";

export default function Global() {
  return (
    <section className="w-full self-stretch bg-white py-12 md:py-16 lg:py-20 xl:py-24">
      {/* Content Container - responsive with max-width */}
      <div className="mx-auto flex h-full flex-col items-center gap-8 px-6 md:gap-12 md:px-8 lg:gap-16 lg:px-16 xl:px-[120px]">
        {/* Title */}
        <div className="flex flex-row items-center justify-center gap-2 border-b-4 border-brand-tan px-0 py-2 md:border-b-[6px]">
          <span className="flex items-center justify-center whitespace-nowrap font-inter text-lg font-bold uppercase leading-6 tracking-[0.1em] text-brand-dark-gray md:text-xl md:leading-7 lg:text-2xl lg:leading-8">
            Global and Growing
          </span>
        </div>

        {/* Content */}
        <div className="flex w-full max-w-[1200px] flex-col items-center justify-center gap-8 p-0 md:gap-12 lg:flex-row lg:gap-16">
          {/* Icon */}
          <div className={`${styles.icon} flex-shrink-0`} />

          {/* Text */}
          <div className="flex flex-1 flex-col items-center gap-4 p-0 lg:items-end">
            {/* Main Heading */}
            <h2 className="w-full text-center font-merriweather text-3xl font-bold leading-tight text-brand-black md:text-4xl md:leading-snug lg:text-right lg:text-5xl lg:leading-[64px]">
              Built Worldwide. Anchored in the Word.
            </h2>

            {/* Description Text */}
            <div className="w-full text-center font-inter text-base font-normal leading-6 text-brand-slate md:text-lg md:leading-7 lg:text-right lg:text-xl lg:leading-8 xl:text-2xl space-y-4">
              <p className="m-0">
                Versemate is powered by believers across the globe - developers,
                translators, and thinkers working together in faith.
              </p>
              <p className="m-0">
                Our tools are modern. Our foundation is eternal.
              </p>
              <p className="m-0">
                Together, we&rsquo;re helping more people encounter Scripture
                clearly, every day, in every language.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
