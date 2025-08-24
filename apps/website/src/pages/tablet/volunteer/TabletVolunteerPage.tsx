/**
 * Tablet Volunteer Landing Page (adapted from desktop design)
 */

import Link from "next/link";
import React from "react";
import { tabletTokens } from "../../../styles/tokens/tablet.tokens";

export default function TabletVolunteerPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "0px",
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        background: tabletTokens.colors.background.white,
        margin: "0 auto",
      }}
      data-testid="tablet-volunteer-page"
    >
      {/* Why Versemate */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: `${tabletTokens.spacing.xxl} ${tabletTokens.layout.containerPadding}`,
          gap: tabletTokens.spacing.xl,
          width: "100%",
          minHeight: "600px",
          background:
            "linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%), #C4C4C4",
          flex: "none",
          alignSelf: "stretch",
        }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            padding: `${tabletTokens.spacing.sm} 0px`,
            gap: tabletTokens.spacing.sm,
            width: "280px",
            borderBottom: `6px solid ${tabletTokens.colors.primary}`,
            flex: "none",
            order: 0,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontFamily: tabletTokens.typography.body.fontFamily,
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "20px",
              lineHeight: "28px",
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: tabletTokens.colors.text.white,
              flex: "none",
            }}
          >
            SERVE WITH VERSEMATE
          </div>
        </div>

        {/* Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: tabletTokens.spacing.md,
            width: "100%",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
          }}
        >
          <h1
            style={{
              width: "100%",
              fontFamily: tabletTokens.typography.hero.fontFamily,
              fontStyle: "normal",
              fontWeight: tabletTokens.typography.hero.fontWeight,
              fontSize: tabletTokens.typography.hero.fontSize,
              lineHeight: tabletTokens.typography.hero.lineHeight,
              color: tabletTokens.colors.text.white,
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              margin: 0,
            }}
          >
            VerseMate exists to help people everywhere truly understand God's
            Word - not just read it.
          </h1>
          <p
            style={{
              width: "100%",
              fontFamily: tabletTokens.typography.body.fontFamily,
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: tabletTokens.typography.body.fontSize,
              lineHeight: tabletTokens.typography.body.lineHeight,
              color: tabletTokens.colors.text.white,
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              margin: 0,
            }}
          >
            Every day, volunteers play a vital role in making this mission
            possible. God created you with unique gifts, passions, and talents.
            When you serve with VerseMate, you'll use them to help others
            encounter Scripture clearly and grow deeper in faith. Whether you
            love languages, prayer, or problem-solving, there's a place for you
            here. And don't worry - we'll provide training and support so you
            can serve with confidence. Take a look at the opportunities below
            and find the one that's the best fit for you:
          </p>
        </div>
      </div>

      {/* Localization Team Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `${tabletTokens.spacing.xxl} ${tabletTokens.layout.containerPadding}`,
          gap: tabletTokens.spacing.xl,
          width: "100%",
          background: tabletTokens.colors.background.white,
          flex: "none",
          alignSelf: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: tabletTokens.spacing.lg,
            width: "100%",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
          }}
        >
          {/* Image placeholder */}
          <div
            style={{
              width: "320px",
              height: "320px",
              background: "#C4C4C4",
              borderRadius: "32px",
              flex: "none",
              order: 0,
            }}
          />

          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "0px",
              gap: tabletTokens.spacing.lg,
              width: "100%",
              flex: "none",
              order: 1,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0px",
                gap: tabletTokens.spacing.md,
                width: "100%",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
              }}
            >
              <h2
                style={{
                  width: "100%",
                  fontFamily: tabletTokens.typography.h2.fontFamily,
                  fontStyle: "normal",
                  fontWeight: tabletTokens.typography.h2.fontWeight,
                  fontSize: tabletTokens.typography.h2.fontSize,
                  lineHeight: tabletTokens.typography.h2.lineHeight,
                  color: tabletTokens.colors.text.primary,
                  textAlign: "center",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  margin: 0,
                }}
              >
                Localization Team
              </h2>
              <p
                style={{
                  width: "100%",
                  fontFamily: tabletTokens.typography.body.fontFamily,
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: tabletTokens.typography.body.fontSize,
                  lineHeight: tabletTokens.typography.body.lineHeight,
                  color: tabletTokens.colors.text.secondary,
                  textAlign: "center",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  margin: 0,
                }}
              >
                Do you speak more than one language? The Bible changes lives
                most powerfully when read in someone's heart language. By
                serving on the Localization Team, you'll help translate, review,
                and test content so people everywhere can experience God's Word
                clearly.
              </p>
            </div>
            <Link href="/localization-team" style={{ textDecoration: "none" }}>
              <button
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: `${tabletTokens.spacing.lg} ${tabletTokens.spacing.xl}`,
                  gap: tabletTokens.spacing.sm,
                  minHeight: tabletTokens.components.button.minHeight,
                  background: tabletTokens.colors.primary,
                  borderRadius: tabletTokens.components.button.borderRadius,
                  border: "none",
                  cursor: "pointer",
                  flex: "none",
                  order: 1,
                }}
              >
                <span
                  style={{
                    fontFamily: tabletTokens.typography.button.fontFamily,
                    fontStyle: "normal",
                    fontWeight: tabletTokens.typography.button.fontWeight,
                    fontSize: tabletTokens.typography.button.fontSize,
                    lineHeight: tabletTokens.typography.button.lineHeight,
                    color: tabletTokens.colors.text.white,
                    flex: "none",
                    order: 0,
                  }}
                >
                  Learn More
                </span>
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Spiritual Support Team Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `${tabletTokens.spacing.xxl} ${tabletTokens.layout.containerPadding}`,
          gap: tabletTokens.spacing.xl,
          width: "100%",
          background: tabletTokens.colors.background.light,
          flex: "none",
          alignSelf: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: tabletTokens.spacing.lg,
            width: "100%",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
          }}
        >
          {/* Image placeholder */}
          <div
            style={{
              width: "320px",
              height: "320px",
              background: "#C4C4C4",
              borderRadius: "32px",
              flex: "none",
              order: 0,
            }}
          />

          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "0px",
              gap: tabletTokens.spacing.lg,
              width: "100%",
              flex: "none",
              order: 1,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0px",
                gap: tabletTokens.spacing.md,
                width: "100%",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
              }}
            >
              <h2
                style={{
                  width: "100%",
                  fontFamily: tabletTokens.typography.h2.fontFamily,
                  fontStyle: "normal",
                  fontWeight: tabletTokens.typography.h2.fontWeight,
                  fontSize: tabletTokens.typography.h2.fontSize,
                  lineHeight: tabletTokens.typography.h2.lineHeight,
                  color: tabletTokens.colors.text.primary,
                  textAlign: "center",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  margin: 0,
                }}
              >
                Spiritual Support Team
              </h2>
              <p
                style={{
                  width: "100%",
                  fontFamily: tabletTokens.typography.body.fontFamily,
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: tabletTokens.typography.body.fontSize,
                  lineHeight: tabletTokens.typography.body.lineHeight,
                  color: tabletTokens.colors.text.secondary,
                  textAlign: "center",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  margin: 0,
                }}
              >
                Do you love encouraging others and praying for people in need?
                On the Spiritual Support Team, you'll come alongside the global
                VerseMate Community — offering Biblical encouragement, prayer,
                and guidance for those seeking hope in Christ.
              </p>
            </div>
            <Link
              href="/spiritual-support-team"
              style={{ textDecoration: "none" }}
            >
              <button
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: `${tabletTokens.spacing.lg} ${tabletTokens.spacing.xl}`,
                  gap: tabletTokens.spacing.sm,
                  minHeight: tabletTokens.components.button.minHeight,
                  background: tabletTokens.colors.primary,
                  borderRadius: tabletTokens.components.button.borderRadius,
                  border: "none",
                  cursor: "pointer",
                  flex: "none",
                  order: 1,
                }}
              >
                <span
                  style={{
                    fontFamily: tabletTokens.typography.button.fontFamily,
                    fontStyle: "normal",
                    fontWeight: tabletTokens.typography.button.fontWeight,
                    fontSize: tabletTokens.typography.button.fontSize,
                    lineHeight: tabletTokens.typography.button.lineHeight,
                    color: tabletTokens.colors.text.white,
                    flex: "none",
                    order: 0,
                  }}
                >
                  Learn More
                </span>
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Technical Support Team Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: `${tabletTokens.spacing.xxl} ${tabletTokens.layout.containerPadding}`,
          gap: tabletTokens.spacing.xl,
          width: "100%",
          background: tabletTokens.colors.background.white,
          flex: "none",
          alignSelf: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: tabletTokens.spacing.lg,
            width: "100%",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
          }}
        >
          {/* Image placeholder */}
          <div
            style={{
              width: "320px",
              height: "320px",
              background: "#C4C4C4",
              borderRadius: "32px",
              flex: "none",
              order: 0,
            }}
          />

          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "0px",
              gap: tabletTokens.spacing.lg,
              width: "100%",
              flex: "none",
              order: 1,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0px",
                gap: tabletTokens.spacing.md,
                width: "100%",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
              }}
            >
              <h2
                style={{
                  width: "100%",
                  fontFamily: tabletTokens.typography.h2.fontFamily,
                  fontStyle: "normal",
                  fontWeight: tabletTokens.typography.h2.fontWeight,
                  fontSize: tabletTokens.typography.h2.fontSize,
                  lineHeight: tabletTokens.typography.h2.lineHeight,
                  color: tabletTokens.colors.text.primary,
                  textAlign: "center",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  margin: 0,
                }}
              >
                Technical Support Team
              </h2>
              <p
                style={{
                  width: "100%",
                  fontFamily: tabletTokens.typography.body.fontFamily,
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: tabletTokens.typography.body.fontSize,
                  lineHeight: tabletTokens.typography.body.lineHeight,
                  color: tabletTokens.colors.text.secondary,
                  textAlign: "center",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  margin: 0,
                }}
              >
                Are you patient, resourceful, and enjoy helping others solve
                problems? On the Technical Support Team, you'll assist VerseMate
                users and partners by answering technical questions, resolving
                issues, and making sure nothing stands in the way of engaging
                with God's Word.
              </p>
            </div>
            <Link
              href="/technical-support-team"
              style={{ textDecoration: "none" }}
            >
              <button
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: `${tabletTokens.spacing.lg} ${tabletTokens.spacing.xl}`,
                  gap: tabletTokens.spacing.sm,
                  minHeight: tabletTokens.components.button.minHeight,
                  background: tabletTokens.colors.primary,
                  borderRadius: tabletTokens.components.button.borderRadius,
                  border: "none",
                  cursor: "pointer",
                  flex: "none",
                  order: 1,
                }}
              >
                <span
                  style={{
                    fontFamily: tabletTokens.typography.button.fontFamily,
                    fontStyle: "normal",
                    fontWeight: tabletTokens.typography.button.fontWeight,
                    fontSize: tabletTokens.typography.button.fontSize,
                    lineHeight: tabletTokens.typography.button.lineHeight,
                    color: tabletTokens.colors.text.white,
                    flex: "none",
                    order: 0,
                  }}
                >
                  Learn More
                </span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
