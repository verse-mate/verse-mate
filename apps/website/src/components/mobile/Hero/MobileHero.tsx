/**
 * Mobile Hero section for volunteer landing page
 */

"use client";

import React from "react";
import { mobileTokens } from "../../../styles/tokens/mobile.tokens";

export default function MobileHero() {
  return (
    <section
      style={{
        padding: `${mobileTokens.spacing.xl} ${mobileTokens.layout.containerPadding}`,
        backgroundColor: mobileTokens.colors.background.white,
        textAlign: "center",
      }}
      data-testid="mobile-hero"
    >
      {/* Hero Badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: `${mobileTokens.spacing.sm} ${mobileTokens.spacing.md}`,
          marginBottom: mobileTokens.spacing.lg,
          borderBottom: `6px solid ${mobileTokens.colors.primary}`,
          fontSize: "14px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: mobileTokens.colors.text.primary,
        }}
      >
        SERVE WITH VERSEMATE
      </div>

      {/* Main Heading */}
      <h1
        style={{
          fontSize: mobileTokens.typography.hero.fontSize,
          lineHeight: mobileTokens.typography.hero.lineHeight,
          fontWeight: mobileTokens.typography.hero.fontWeight,
          fontFamily: mobileTokens.typography.hero.fontFamily,
          letterSpacing: mobileTokens.typography.hero.letterSpacing,
          color: mobileTokens.colors.text.primary,
          marginBottom: mobileTokens.spacing.lg,
          marginTop: 0,
        }}
      >
        VerseMate exists to help people everywhere truly understand God's Word -
        not just read it.
      </h1>

      {/* Description */}
      <div
        style={{
          fontSize: mobileTokens.typography.body.fontSize,
          lineHeight: mobileTokens.typography.body.lineHeight,
          fontFamily: mobileTokens.typography.body.fontFamily,
          color: mobileTokens.colors.text.secondary,
          marginBottom: mobileTokens.spacing.xl,
          textAlign: "left",
        }}
      >
        <p style={{ margin: `0 0 ${mobileTokens.spacing.md} 0` }}>
          Every day, volunteers play a vital role in making this mission
          possible. God created you with unique gifts, passions, and talents.
          When you serve with VerseMate, you'll use them to help others
          encounter Scripture clearly and grow deeper in faith.
        </p>

        <p style={{ margin: `0 0 ${mobileTokens.spacing.md} 0` }}>
          Whether you love languages, prayer, or problem-solving, there's a
          place for you here. And don't worry - we'll provide training and
          support so you can serve with confidence.
        </p>

        <p style={{ margin: 0 }}>
          Take a look at the opportunities below and find the one that's the
          best fit for you:
        </p>
      </div>
    </section>
  );
}
