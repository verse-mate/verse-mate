import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";
import styles from "./Hero.module.css";

export default function HeroSection() {
  return (
    <section className={`${styles.section} relative overflow-hidden`}>
      {/* Text Pattern Overlay */}
      <div className={`${styles.textOverlay} absolute inset-0`} />

      {/* Content Wrapper */}
      <div className={`${styles.contentWrapper} relative`}>
        {/* Content */}
        <div className={`${styles.content} absolute flex flex-col items-start justify-center isolate`}>
          {/* Main Heading */}
          <h1 className={`${styles.heading} font-merriweather font-bold text-white`}>
            The Bible Was Meant to Be Understood - Not Just Read.
          </h1>

          {/* Description Text */}
          <p className={`${styles.description} font-inter font-normal text-white`}>
            When people truly understand Scripture, lives change. Versemate helps
            anyone, anywhere, connect with God&rsquo;s Word clearly - and grow
            deeper in faith.
          </p>

          {/* Button Container */}
          <div className={`${styles.buttonContainer} flex flex-row items-start`}>
            {/* Primary Button - Try Versemate (outline) */}
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateToApp();
              }}
              className={`${styles.buttonPrimary} flex flex-row items-center justify-center cursor-pointer no-underline bg-transparent`}
            >
              <span className={`${styles.buttonText} ${styles.buttonTextPrimary} font-inter text-white`}>
                Try Versemate
              </span>
            </Link>

            {/* Secondary Button - Get the app (solid) */}
            <Link
              href="/download-app"
              className={`${styles.buttonSecondary} flex flex-row items-center justify-center cursor-pointer no-underline bg-white border-none`}
            >
              <span className={`${styles.buttonText} ${styles.buttonTextSecondary} font-inter text-black text-center flex items-center justify-center`}>
                Get the app
              </span>
            </Link>
          </div>
        </div>

        {/* Bottom Text Line */}
        <div className={`${styles.bottomText} absolute flex flex-row items-center justify-center`}>
          <span className={`${styles.bottomTextSpan} font-inter font-normal text-center text-white whitespace-nowrap`}>
            Always free. For everyone. Forever.
          </span>
        </div>
      </div>

      {/* Hero Image Container */}
      <div className={`${styles.heroImageContainer} absolute flex flex-col items-start isolate`}>
        {/* Shadow */}
        <div className={`${styles.heroImageShadow} absolute`} />

        {/* Hero Images */}
        <div className={`${styles.heroImages} absolute flex flex-col items-start z-10`}>
          {/* Background iPad View */}
          <img
            src="/ipad.png"
            alt="Desktop View"
            className={`${styles.ipadImage} absolute w-full h-auto z-10`}
          />

          {/* Middle Bible Reader View */}
          <img
            src="/bibleReader.png"
            alt="Bible Reader View"
            className={`${styles.bibleReaderImage} absolute z-20`}
          />

          {/* Front Summary View */}
          <img
            src="/summary.png"
            alt="Summary View"
            className={`${styles.summaryImage} absolute z-30`}
          />
        </div>
      </div>
    </section>
  );
}
