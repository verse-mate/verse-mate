"use client";

import { navigateToLogin } from "@/lib/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./Header.module.css";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      data-header="desktop"
      className={`${styles.header} absolute left-0 right-0 top-0 z-50 flex flex-row items-center justify-between bg-white`}
    >
      <div className="w-full max-w-[1440px] mx-auto flex flex-row items-center justify-between px-8 xl:px-16">
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

      {/* Menu */}
      <nav
        className={`${styles.nav} hidden flex-row items-center justify-end p-0`}
      >
        {/* Home Menu Item */}
        <div className={`${styles.menuItem} ${styles.menuItemHome} flex flex-col items-center justify-center`}>
          <Link
            href="/"
            className={`${styles.menuLink} w-full text-center font-inter text-base font-medium leading-6 no-underline ${isScrolled ? "text-white" : "text-black"}`}
          >
            Home
          </Link>
          <div className={`${styles.underline} rounded-sm bg-white`} />
        </div>

        {/* Volunteer Menu Item */}
        <div className={`${styles.menuItem} ${styles.menuItemVolunteer} flex flex-col items-center justify-center`}>
          <a
            href="mailto:info@versemate.org?subject=I want to volunteer&body=Hi, I'm interested in helping with VerseMate..."
            className={`${styles.menuLink} w-full text-center font-inter text-base font-medium leading-6 no-underline ${isScrolled ? "text-white" : "text-black"}`}
          >
            Volunteer
          </a>
          <div className={`${styles.underline} rounded-sm bg-white`} />
        </div>

        {/* Give Menu Item */}
        <div className={`${styles.menuItem} ${styles.menuItemGive} flex flex-col items-center justify-center`}>
          <Link
            href="/give"
            className={`${styles.menuLink} w-full text-center font-inter text-base font-medium leading-6 no-underline ${isScrolled ? "text-white" : "text-black"}`}
          >
            Give
          </Link>
          <div className={`${styles.underline} rounded-sm bg-white`} />
        </div>

        {/* About Menu Item */}
        <div className={`${styles.menuItem} ${styles.menuItemAbout} flex flex-col items-center justify-center`}>
          <Link
            href="/about"
            className={`${styles.menuLink} w-full text-center font-inter text-base font-medium leading-6 no-underline ${isScrolled ? "text-white" : "text-black"}`}
          >
            About
          </Link>
          <div className={`${styles.underline} rounded-sm bg-white`} />
        </div>

        {/* Login Menu Item */}
        <div className={`${styles.menuItem} ${styles.menuItemLogin} flex flex-col items-center justify-center`}>
          <button
            onClick={() => navigateToLogin()}
            className={`${styles.menuLink} w-full cursor-pointer border-none bg-transparent text-center font-inter text-base font-medium leading-6 no-underline ${isScrolled ? "text-white" : "text-black"}`}
          >
            Login
          </button>
          <div className={`${styles.underline} rounded-sm bg-white`} />
        </div>
      </nav>
      </div>
    </header>
  );
}
