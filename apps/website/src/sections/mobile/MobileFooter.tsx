"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./MobileFooter.module.css";

export default function MobileFooter() {
  return (
    <footer className={`${styles.footer} flex flex-col items-center justify-center`}>
      {/* pageLinks */}
      <div className={`${styles.pageLinks} flex flex-row items-center justify-between`}>
        {/* Logo */}
        <div className={`${styles.logo}`}>
          <Link href="/" className="relative flex h-full items-center">
            <Image
              src="/versemate-logo.png"
              alt="VerseMate"
              width={124}
              height={34}
              className={`${styles.logoImage} object-contain`}
            />
          </Link>
        </div>

        {/* Privacy Policy Link */}
        <Link
          href="/privacy"
          className={`${styles.privacyLink} font-inter font-normal text-white no-underline`}
        >
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
