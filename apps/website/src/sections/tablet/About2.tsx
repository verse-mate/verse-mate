import styles from "./About2.module.css";

export default function About2() {
  return (
    <section
      className={`${styles.aboutSection} isolate z-[1] flex flex-none flex-col items-center justify-center self-stretch gap-12 bg-brand-tan px-16 py-20`}
    >
      {/* Content */}
      <div
        className={`${styles.contentContainer} flex flex-none flex-col items-start justify-center self-stretch gap-12 p-0`}
      >
        {/* Image */}
        <div
          className={`${styles.imageContainer} flex-none self-stretch rounded-[50px]`}
        />

        {/* Text */}
        <div
          className={`${styles.textContainer} flex flex-none flex-col items-start justify-center self-stretch gap-4 p-0`}
        >
          {/* Main Heading */}
          <h1
            className={`${styles.heading} flex-none self-stretch font-merriweather font-bold text-black`}
          >
            Illuminating God&rsquo;s Word for Everyone
          </h1>

          {/* Description */}
          <p
            className={`${styles.description} flex-none self-stretch font-inter font-normal text-brand-slate`}
          >
            We believe the Bible isn&rsquo;t just for scholars or clergy - it&rsquo;s for everyone. Whether you&rsquo;re discovering Scripture for the first time or leading a study group, Versemate helps illuminate God&rsquo;s Word for real understanding and lasting transformation.
          </p>
        </div>
      </div>
    </section>
  );
}