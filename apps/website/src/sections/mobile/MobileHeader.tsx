"use client";

import { navigateToLogin } from "@/lib/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { mobileTokens } from "../../styles/tokens/mobile.tokens";
import styles from "./MobileHeader.module.css";

export default function MobileHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header
        className="absolute left-0 right-0 top-0 z-[1000] flex flex-row items-center justify-between bg-white px-4 transition-all duration-300"
        style={{ height: mobileTokens.components.nav.height }}
      >
        {/* Logo */}
        <div className="flex-1">
          <Link href="/" className="relative flex items-center">
            <Image
              src="/versemate-logo.png"
              alt="VerseMate"
              width={120}
              height={32}
              className={`${styles.logoImage} object-contain`}
            />
          </Link>
        </div>

        {/* Join as a Volunteer Button */}
        <Link
          href="/volunteer"
          className={`${styles.volunteerButton} flex cursor-pointer flex-row items-center justify-center gap-2 whitespace-nowrap rounded-full border-none bg-black px-5 py-3 font-inter font-semibold text-white no-underline`}
        >
          Join as a Volunteer
        </Link>

        {/* Hamburger Menu Button */}
        <button
          onClick={toggleMenu}
          className={`${styles.hamburgerButton} hidden cursor-pointer flex-col items-center justify-center border-none bg-transparent p-0`}
          aria-label="Toggle menu"
        >
          <div
            className={`${styles.hamburgerLine} bg-white`}
            style={{
              transform: isMenuOpen
                ? "rotate(45deg) translate(6px, 6px)"
                : "none",
            }}
          />
          <div
            className={`${styles.hamburgerLine} ${styles.hamburgerLineMiddle} bg-white`}
            style={{ opacity: isMenuOpen ? 0 : 1 }}
          />
          <div
            className={`${styles.hamburgerLine} bg-white`}
            style={{
              transform: isMenuOpen
                ? "rotate(-45deg) translate(6px, -6px)"
                : "none",
            }}
          />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div
          className={`${styles.menuOverlay} fixed left-0 right-0 bottom-0 z-[999] flex flex-col items-center`}
          style={{ top: mobileTokens.components.nav.height, paddingTop: mobileTokens.spacing.xl }}
        >
          <nav
            className="flex flex-col items-center"
            style={{ gap: mobileTokens.spacing.lg }}
          >
            <Link
              href="/"
              onClick={() => setIsMenuOpen(false)}
              className="text-center text-white no-underline"
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
              }}
            >
              Home
            </Link>
            <Link
              href="/volunteer"
              onClick={() => setIsMenuOpen(false)}
              className="text-center text-white no-underline"
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
              }}
            >
              Volunteer
            </Link>
            <Link
              href="/give"
              onClick={() => setIsMenuOpen(false)}
              className="text-center text-white no-underline"
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
              }}
            >
              Give
            </Link>
            <Link
              href="/about"
              onClick={() => setIsMenuOpen(false)}
              className="text-center text-white no-underline"
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
              }}
            >
              About
            </Link>
            <button
              onClick={() => {
                navigateToLogin();
                setIsMenuOpen(false);
              }}
              className="cursor-pointer border-none bg-transparent text-center text-white"
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
              }}
            >
              Login
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
