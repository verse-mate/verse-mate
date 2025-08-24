/**
 * Mobile Call-to-Action section for volunteer landing page
 */

"use client";

import React from "react";
import { mobileTokens } from "../../../styles/tokens/mobile.tokens";

export default function MobileCTA() {
  return (
    <section
      style={{
        padding: `${mobileTokens.spacing.xl} ${mobileTokens.layout.containerPadding}`,
        backgroundColor: mobileTokens.colors.primary,
        textAlign: "center",
      }}
      data-testid="mobile-cta"
    >
      {/* CTA Content */}
      <div
        style={{
          marginBottom: mobileTokens.spacing.xl,
        }}
      >
        <h2
          style={{
            fontSize: mobileTokens.typography.h2.fontSize,
            lineHeight: mobileTokens.typography.h2.lineHeight,
            fontWeight: mobileTokens.typography.h2.fontWeight,
            fontFamily: mobileTokens.typography.h2.fontFamily,
            color: mobileTokens.colors.text.white,
            marginBottom: mobileTokens.spacing.md,
            marginTop: 0,
          }}
        >
          Ready to Make a Difference?
        </h2>

        <p
          style={{
            fontSize: mobileTokens.typography.body.fontSize,
            lineHeight: mobileTokens.typography.body.lineHeight,
            fontFamily: mobileTokens.typography.body.fontFamily,
            color: mobileTokens.colors.text.white,
            marginBottom: mobileTokens.spacing.lg,
            marginTop: 0,
            opacity: 0.9,
          }}
        >
          Join our community of volunteers and help people everywhere understand
          God's Word more deeply. Your unique gifts can make an eternal impact.
        </p>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: mobileTokens.spacing.md,
          alignItems: "center",
        }}
      >
        {/* Primary CTA Button */}
        <button
          style={{
            width: "100%",
            maxWidth: "280px",
            minHeight: mobileTokens.components.button.minHeight,
            padding: `${mobileTokens.spacing.md} ${mobileTokens.spacing.lg}`,
            backgroundColor: mobileTokens.colors.background.white,
            color: mobileTokens.colors.primary,
            border: "none",
            borderRadius: mobileTokens.components.button.borderRadius,
            fontSize: mobileTokens.typography.button.fontSize,
            fontWeight: mobileTokens.typography.button.fontWeight,
            fontFamily: mobileTokens.typography.button.fontFamily,
            cursor: "pointer",
            transition: "all 0.2s ease",
            touchAction: "manipulation",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
          data-testid="mobile-cta-primary"
          onTouchStart={(e) => {
            e.currentTarget.style.transform = "scale(0.98)";
            e.currentTarget.style.backgroundColor = "#f8f9fa";
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.backgroundColor =
              mobileTokens.colors.background.white;
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f8f9fa";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              mobileTokens.colors.background.white;
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
          }}
        >
          Start Your Application
        </button>

        {/* Secondary CTA Button */}
        <button
          style={{
            width: "100%",
            maxWidth: "280px",
            minHeight: mobileTokens.components.button.minHeight,
            padding: `${mobileTokens.spacing.md} ${mobileTokens.spacing.lg}`,
            backgroundColor: "transparent",
            color: mobileTokens.colors.text.white,
            border: `2px solid ${mobileTokens.colors.text.white}`,
            borderRadius: mobileTokens.components.button.borderRadius,
            fontSize: mobileTokens.typography.button.fontSize,
            fontWeight: mobileTokens.typography.button.fontWeight,
            fontFamily: mobileTokens.typography.button.fontFamily,
            cursor: "pointer",
            transition: "all 0.2s ease",
            touchAction: "manipulation",
          }}
          data-testid="mobile-cta-secondary"
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.transform = "scale(0.98)";
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.transform = "scale(1)";
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          Learn More About VerseMate
        </button>
      </div>

      {/* Additional Info */}
      <div
        style={{
          marginTop: mobileTokens.spacing.xl,
          paddingTop: mobileTokens.spacing.lg,
          borderTop: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            lineHeight: "1.5",
            fontFamily: mobileTokens.typography.body.fontFamily,
            color: mobileTokens.colors.text.white,
            margin: 0,
            opacity: 0.8,
          }}
        >
          Questions? Email us at{" "}
          <a
            href="mailto:volunteer@versemate.org"
            style={{
              color: mobileTokens.colors.text.white,
              textDecoration: "underline",
              fontWeight: 600,
            }}
          >
            volunteer@versemate.org
          </a>
        </p>
      </div>
    </section>
  );
}
