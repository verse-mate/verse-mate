"use client";

import { navigateToLogin } from "@/lib/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { mobileTokens } from "../../styles/tokens/mobile.tokens";

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
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 16px",
          position: "absolute",
          height: mobileTokens.components.nav.height,
          left: "0px",
          right: "0px",
          top: "0px",
          zIndex: 1000,
          background: "#FFFFFF",
          transition: "all 0.3s ease",
        }}
      >
        {/* Logo */}
        <div
          style={{
            flex: "1",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              position: "relative",
            }}
          >
            <Image
              src="/versemate-logo.png"
              alt="VerseMate"
              width={120}
              height={32}
              style={{
                objectFit: "contain",
                filter: "brightness(0)",
              }}
            />
          </Link>
        </div>

        {/* Join as a Volunteer Button */}
        <Link
          href="/volunteer"
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            padding: "12px 20px",
            gap: "8px",
            width: "160px",
            height: "44px",
            background: "#000000",
            borderRadius: "100px",
            flex: "none",
            order: 1,
            flexGrow: 0,
            border: "none",
            cursor: "pointer",
            textDecoration: "none",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 600,
            fontSize: "11px",
            lineHeight: "16px",
            color: "#FFFFFF",
            whiteSpace: "nowrap",
          }}
        >
          Join as a Volunteer
        </Link>

        {/* Hamburger Menu Button */}
        <button
          onClick={toggleMenu}
          style={{
            display: "none", // Hidden but keeping code intact
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            width: "24px",
            height: "24px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "0",
          }}
          aria-label="Toggle menu"
        >
          <div
            style={{
              width: "20px",
              height: "2px",
              backgroundColor: "#FFFFFF",
              transition: "all 0.3s ease",
              transform: isMenuOpen
                ? "rotate(45deg) translate(6px, 6px)"
                : "none",
            }}
          />
          <div
            style={{
              width: "20px",
              height: "2px",
              backgroundColor: "#FFFFFF",
              margin: "3px 0",
              transition: "all 0.3s ease",
              opacity: isMenuOpen ? 0 : 1,
            }}
          />
          <div
            style={{
              width: "20px",
              height: "2px",
              backgroundColor: "#FFFFFF",
              transition: "all 0.3s ease",
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
          style={{
            position: "fixed",
            top: mobileTokens.components.nav.height,
            left: "0",
            right: "0",
            bottom: "0",
            backgroundColor: "rgba(0, 0, 0, 0.95)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: mobileTokens.spacing.xl,
          }}
        >
          <nav
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: mobileTokens.spacing.lg,
            }}
          >
            <Link
              href="/"
              onClick={() => setIsMenuOpen(false)}
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
                color: mobileTokens.colors.text.white,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Home
            </Link>
            <Link
              href="/volunteer"
              onClick={() => setIsMenuOpen(false)}
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
                color: mobileTokens.colors.text.white,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Volunteer
            </Link>
            <Link
              href="/give"
              onClick={() => setIsMenuOpen(false)}
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
                color: mobileTokens.colors.text.white,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Give
            </Link>
            <Link
              href="/about"
              onClick={() => setIsMenuOpen(false)}
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
                color: mobileTokens.colors.text.white,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              About
            </Link>
            <button
              onClick={() => {
                navigateToLogin();
                setIsMenuOpen(false);
              }}
              style={{
                fontFamily: mobileTokens.typography.h2.fontFamily,
                fontWeight: mobileTokens.typography.h2.fontWeight,
                fontSize: mobileTokens.typography.h2.fontSize,
                lineHeight: mobileTokens.typography.h2.lineHeight,
                color: mobileTokens.colors.text.white,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "center",
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
