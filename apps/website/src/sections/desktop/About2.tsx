import styles from "./About2.module.css";

export default function About2Section() {
  return (
    <section className="w-full bg-brand-light-cream">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center gap-12 px-8 py-12 md:px-12 md:py-16 lg:px-16 lg:py-20 xl:px-[120px]">
        {/* Content */}
        <div className="flex w-full max-w-[1200px] flex-col items-center gap-8 md:gap-10 lg:flex-row lg:gap-12">
          {/* Text */}
          <div className="flex w-full flex-col items-start justify-center gap-4 lg:flex-1">
            {/* Main Heading */}
            <h2 className="w-full font-merriweather text-3xl font-bold leading-tight text-brand-black md:text-4xl md:leading-snug lg:text-5xl lg:leading-[64px]">
              Illuminating God&rsquo;s Word for Everyone
            </h2>

            {/* Description Text */}
            <p className="w-full font-inter text-lg font-normal leading-7 text-brand-slate md:text-xl md:leading-relaxed lg:text-2xl lg:leading-8">
              We believe the Bible isn&rsquo;t just for scholars or clergy -
              it&rsquo;s for everyone. Whether you&rsquo;re discovering Scripture
              for the first time or leading a study group, Versemate helps
              illuminate God&rsquo;s Word for real understanding and lasting
              transformation.
            </p>
          </div>

          {/* Image */}
          <div className={`${styles.image} w-full max-w-[400px] rounded-[50px] md:max-w-[450px] lg:w-[480px] lg:max-w-none lg:flex-shrink-0`} />
        </div>
      </div>
    </section>
  );
}
