"use client";

import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";
import styles from "./MobileHero.module.css";

export default function MobileHero() {
  return (
    <section className={`${styles.section} relative overflow-hidden`}>
      {/* Text Pattern Overlay */}
      <div className={`${styles.textOverlay} absolute inset-0`} />

      {/* Content */}
      <div className={`${styles.content} absolute left-0 right-0 top-[76px] flex flex-col items-start self-stretch isolate`}>
        {/* Main Heading */}
        <h1 className={`${styles.heading} self-stretch font-merriweather font-bold text-white`}>
          The Bible Was Meant to
          <br />
          Be Understood -<br />
          Not Just Read.
        </h1>

        {/* Description Text */}
        <p className={`${styles.description} self-stretch font-inter text-white`}>
          When people truly understand Scripture, lives change. Versemate helps
          anyone, anywhere, connect with God's Word clearly - and grow deeper in
          faith.
        </p>

        {/* Button Container */}
        <div className={`${styles.buttonContainer} flex flex-row items-start self-stretch`}>
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
            <span className={`${styles.buttonText} ${styles.buttonTextSecondary} font-inter text-black`}>
              Get the app
            </span>
          </Link>
        </div>
      </div>

      {/* Hero Image Container */}
      <div className={`${styles.heroImageContainer} absolute z-10`}>
        {/* Background iPad View */}
        <img
          src="/ipad.png"
          alt="Desktop View"
          className={`${styles.ipadImage} absolute h-auto z-10`}
        />

        {/* Middle Bible Reader View */}
        <img
          src="/bibleReader.png"
          alt="Bible Reader View"
          className={`${styles.bibleReaderImage} absolute h-auto z-20`}
        />

        {/* Front Summary View */}
        <img
          src="/summary.png"
          alt="Summary View"
          className={`${styles.summaryImage} absolute h-auto z-30`}
        />
      </div>

      {/* Bottom Text Line */}
      <div className={`${styles.bottomText} absolute flex flex-row items-center justify-center`}>
        <span className={`${styles.bottomTextSpan} font-inter font-normal text-center text-white whitespace-nowrap`}>
          Always free. For everyone. Forever.
        </span>
      </div>
    </section>
  );
}
