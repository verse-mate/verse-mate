import styles from "./About1.module.css";

export default function About1() {
  return (
    <section
      className={`${styles.aboutSection} z-[5] flex flex-none flex-col items-center self-stretch gap-16 bg-white px-16 pt-[83px] pb-[83px]`}
    >
      {/* Title */}
      <div
        className={`${styles.titleContainer} flex flex-none flex-row items-center justify-center gap-2 border-b-[6px] border-brand-gold px-0 py-2`}
      >
        <h2
          className={`${styles.title} flex-none text-center font-inter font-bold uppercase tracking-[0.1em] text-brand-slate`}
        >
          About
        </h2>
      </div>

      {/* Content */}
      <div
        className={`${styles.contentContainer} flex flex-none flex-col items-start justify-center self-stretch gap-16 p-0`}
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
            Built by Believers. Guided by the Word.
          </h1>

          {/* Description */}
          <p
            className={`${styles.description} flex-none self-stretch font-inter font-normal text-brand-slate`}
          >
            Versemate is a nonprofit organization on a mission to make the Bible easier to understand, study, and love - for everyone, everywhere. We are developers, translators, and believers from around the world, united by one calling: to help more people connect with God through His Word.
            <br /><br />
            To make the Word of God easy to understand, deeply accessible, and free to everyone - so more people around the world can encounter Scripture, grow in faith, and walk closer with Christ.
          </p>
        </div>
      </div>
    </section>
  );
}