import styles from "./About1.module.css";

export default function About1() {
  return (
    <section className="w-full self-stretch bg-brand-white py-12 md:py-16 lg:py-20 xl:py-[83px]">
      {/* Content Container - responsive max-width with centered layout */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-10 px-6 md:gap-12 md:px-8 lg:gap-14 lg:px-12 xl:gap-[69px] xl:px-16 2xl:px-[120px]">
        {/* Title */}
        <div className="flex flex-row items-center justify-center gap-2 border-b-4 border-brand-tan px-0 py-2 md:border-b-[5px] lg:border-b-[6px]">
          <span className="flex items-center justify-center whitespace-nowrap font-inter text-lg font-bold uppercase leading-7 tracking-[0.1em] text-brand-dark-gray md:text-xl md:leading-7 lg:text-2xl lg:leading-8">
            About
          </span>
        </div>

        {/* Content */}
        <div className="flex w-full max-w-[1200px] flex-col items-center gap-8 md:gap-10 lg:flex-row lg:items-center lg:gap-12 xl:gap-16">
          {/* Image */}
          <div
            className={`${styles.image} h-64 w-full max-w-md flex-shrink-0 rounded-3xl md:h-80 md:rounded-[40px] lg:h-96 lg:w-96 lg:rounded-[50px] xl:h-[480px] xl:w-[480px]`}
          />

          {/* Text */}
          <div className="flex w-full flex-1 flex-col items-start justify-center gap-4 lg:gap-4">
            {/* Main Heading */}
            <h2 className="w-full font-merriweather text-3xl font-bold leading-tight text-brand-black md:text-4xl md:leading-tight lg:text-[44px] lg:leading-[56px] xl:text-5xl xl:leading-[64px]">
              Built by Believers.
              <br />
              Guided by the Word.
            </h2>

            {/* Description Text */}
            <p className="w-full font-inter text-base font-normal leading-7 text-brand-slate md:text-lg md:leading-7 lg:text-xl lg:leading-8 xl:text-2xl xl:leading-8">
              Versemate is a nonprofit organization on a mission to make the Bible
              easier to understand, study, and love - for everyone, everywhere.
              <br />
              We are developers, translators, and believers from around the world,
              united by one calling: to help more people connect with God through
              His Word.
              <br />
              <br />
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
