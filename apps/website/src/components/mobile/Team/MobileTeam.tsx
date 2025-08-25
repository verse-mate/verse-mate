/**
 * Mobile Team section for volunteer landing page
 */

"use client";

import React from "react";
import { mobileTokens } from "../../../styles/tokens/mobile.tokens";

export default function MobileTeam() {
  const opportunities = [
    {
      id: "translation",
      title: "Translation & Language",
      description:
        "Help translate Bible content and make Scripture accessible in different languages.",
      skills: ["Multilingual", "Detail-oriented", "Cultural sensitivity"],
      commitment: "2-4 hours/week",
    },
    {
      id: "prayer",
      title: "Prayer Support",
      description:
        "Intercede for users, content creators, and the global impact of VerseMate.",
      skills: ["Heart for prayer", "Spiritual maturity", "Consistency"],
      commitment: "30 min/day",
    },
    {
      id: "tech",
      title: "Technical Development",
      description:
        "Build features, fix bugs, and improve the platform experience.",
      skills: ["Programming", "Problem-solving", "User-focused"],
      commitment: "3-6 hours/week",
    },
    {
      id: "content",
      title: "Content Creation",
      description:
        "Write explanations, create study guides, and develop devotional content.",
      skills: ["Writing", "Biblical knowledge", "Teaching heart"],
      commitment: "2-5 hours/week",
    },
  ];

  return (
    <section
      style={{
        padding: `${mobileTokens.spacing.xl} ${mobileTokens.layout.containerPadding}`,
        backgroundColor: mobileTokens.colors.background.beige,
      }}
      data-testid="mobile-team"
    >
      {/* Section Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: mobileTokens.spacing.xl,
        }}
      >
        <h2
          style={{
            fontSize: mobileTokens.typography.h2.fontSize,
            lineHeight: mobileTokens.typography.h2.lineHeight,
            fontWeight: mobileTokens.typography.h2.fontWeight,
            fontFamily: mobileTokens.typography.h2.fontFamily,
            color: mobileTokens.colors.text.primary,
            marginBottom: mobileTokens.spacing.md,
            marginTop: 0,
          }}
        >
          Volunteer Opportunities
        </h2>

        <p
          style={{
            fontSize: mobileTokens.typography.body.fontSize,
            lineHeight: mobileTokens.typography.body.lineHeight,
            fontFamily: mobileTokens.typography.body.fontFamily,
            color: mobileTokens.colors.text.secondary,
            margin: 0,
          }}
        >
          Find the perfect way to use your God-given talents
        </p>
      </div>

      {/* Opportunities Grid */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: mobileTokens.spacing.lg,
        }}
      >
        {opportunities.map((opportunity) => (
          <div
            key={opportunity.id}
            style={{
              backgroundColor: mobileTokens.colors.background.white,
              borderRadius: mobileTokens.components.card.borderRadius,
              padding: mobileTokens.spacing.lg,
              border: `1px solid ${mobileTokens.colors.gray}`,
              boxShadow: mobileTokens.effects.shadow.card,
            }}
            data-testid={`mobile-opportunity-${opportunity.id}`}
          >
            {/* Opportunity Title */}
            <h3
              style={{
                fontSize: mobileTokens.typography.h3.fontSize,
                lineHeight: mobileTokens.typography.h3.lineHeight,
                fontWeight: mobileTokens.typography.h3.fontWeight,
                fontFamily: mobileTokens.typography.h3.fontFamily,
                color: mobileTokens.colors.text.primary,
                marginBottom: mobileTokens.spacing.sm,
                marginTop: 0,
              }}
            >
              {opportunity.title}
            </h3>

            {/* Description */}
            <p
              style={{
                fontSize: mobileTokens.typography.body.fontSize,
                lineHeight: mobileTokens.typography.body.lineHeight,
                fontFamily: mobileTokens.typography.body.fontFamily,
                color: mobileTokens.colors.text.secondary,
                marginBottom: mobileTokens.spacing.md,
                marginTop: 0,
              }}
            >
              {opportunity.description}
            </p>

            {/* Skills */}
            <div
              style={{
                marginBottom: mobileTokens.spacing.md,
              }}
            >
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: mobileTokens.typography.body.fontFamily,
                  color: mobileTokens.colors.text.primary,
                  marginBottom: mobileTokens.spacing.xs,
                  marginTop: 0,
                }}
              >
                Skills:
              </h4>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: mobileTokens.spacing.xs,
                }}
              >
                {opportunity.skills.map((skill, index) => (
                  <span
                    key={index}
                    style={{
                      padding: `4px ${mobileTokens.spacing.sm}`,
                      backgroundColor: mobileTokens.colors.background.beige,
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      fontFamily: mobileTokens.typography.body.fontFamily,
                      color: mobileTokens.colors.text.secondary,
                      border: `1px solid ${mobileTokens.colors.gray}`,
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Commitment */}
            <div
              style={{
                marginBottom: mobileTokens.spacing.md,
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: mobileTokens.typography.body.fontFamily,
                  color: mobileTokens.colors.text.primary,
                }}
              >
                Time commitment:
              </span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 400,
                  fontFamily: mobileTokens.typography.body.fontFamily,
                  color: mobileTokens.colors.text.secondary,
                  marginLeft: "4px",
                }}
              >
                {opportunity.commitment}
              </span>
            </div>

            {/* Action Button */}
            <button
              style={{
                width: "100%",
                minHeight: mobileTokens.components.button.height,
                padding: `${mobileTokens.spacing.sm} ${mobileTokens.spacing.md}`,
                backgroundColor: mobileTokens.colors.primary,
                color: mobileTokens.colors.text.white,
                border: "none",
                borderRadius: mobileTokens.components.button.borderRadius,
                fontSize: mobileTokens.typography.button.fontSize,
                fontWeight: mobileTokens.typography.button.fontWeight,
                fontFamily: mobileTokens.typography.button.fontFamily,
                cursor: "pointer",
                transition: "background-color 0.2s ease",
                touchAction: "manipulation",
              }}
              data-testid={`mobile-apply-${opportunity.id}`}
              onTouchStart={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              Learn More
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
