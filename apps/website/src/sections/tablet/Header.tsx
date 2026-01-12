"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "./Header.module.css";

export default function Header() {
  return (
    <header
      className={`${styles.header} mx-auto flex flex-row items-center justify-between self-stretch bg-white px-16 py-0`}
    >
      {/* Logo */}
      <div className={`${styles.logo}`}>
        <Link href="/" className="relative flex h-full items-center p-0 m-0">
          <Image
            src="/versemate-logo.png"
            alt="VerseMate"
            width={175}
            height={48}
            className="object-contain"
          />
        </Link>
      </div>

      {/* Button */}
      <Link
        href="/volunteer"
        className={`${styles.volunteerButton} flex cursor-pointer flex-row items-center justify-center gap-2 rounded-full border-none bg-black px-8 py-4 no-underline`}
      >
        <span className={`${styles.buttonText} font-inter text-base font-normal leading-6 text-white`}>
          Join as a Volunteer
        </span>
      </Link>

      {/* Menu - Hidden for tablet as per Figma design */}
      <nav
        className={`${styles.nav} hidden flex-row items-center justify-end p-0`}
      ></nav>
    </header>
  );
}