/**
 * Desktop Volunteer Landing Page (converted from existing volunteer.tsx)
 */

import Link from "next/link";
import React from "react";
import { desktopTokens } from "../../../styles/tokens/desktop.tokens";

export default function DesktopVolunteerPage() {
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
        background: desktopTokens.colors.background.white,
        margin: "0 auto",
      }}
      data-testid="desktop-volunteer-page"
    >
      {/* Why Versemate */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "96px 120px",
          gap: "64px",
          width: "100%",
          maxWidth: desktopTokens.layout.maxWidth,
          minHeight: "736px",
          background:
            "linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%), #C4C4C4",
          flex: "none",
          alignSelf: "stretch",
          margin: "0 auto",
        }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            padding: "8px 0px",
            gap: "8px",
            width: "348px",
            height: "48px",
            borderBottom: `6px solid ${desktopTokens.colors.primary}`,
            flex: "none",
            order: 0,
            flexGrow: 0,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "368px",
              height: "32px",
              fontFamily: desktopTokens.typography.body.fontFamily,
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "24px",
              lineHeight: "32px",
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: desktopTokens.colors.text.white,
              flex: "none",
              order: 0,
              flexGrow: 0,
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
            gap: "16px",
            width: "100%",
            maxWidth: "1200px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          <h1
            style={{
              width: "100%",
              fontFamily: desktopTokens.typography.hero.fontFamily,
              fontStyle: "normal",
              fontWeight: desktopTokens.typography.hero.fontWeight,
              fontSize: desktopTokens.typography.hero.fontSize,
              lineHeight: desktopTokens.typography.hero.lineHeight,
              color: desktopTokens.colors.text.white,
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: 0,
            }}
          >
            VerseMate exists to help people everywhere truly understand God's
            Word - not just read it.
          </h1>
          <p
            style={{
              width: "100%",
              fontFamily: desktopTokens.typography.body.fontFamily,
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
              color: desktopTokens.colors.text.white,
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
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
          padding: "96px 120px",
          gap: "64px",
          width: "100%",
          maxWidth: desktopTokens.layout.maxWidth,
          background: desktopTokens.colors.background.white,
          flex: "none",
          alignSelf: "stretch",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            padding: "0px",
            gap: "69px",
            width: "100%",
            maxWidth: "1200px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: "0px",
              gap: "32px",
              width: "651px",
              flex: "none",
              order: 0,
              flexGrow: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "16px",
                width: "100%",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h2
                style={{
                  width: "100%",
                  fontFamily: desktopTokens.typography.h2.fontFamily,
                  fontStyle: "normal",
                  fontWeight: desktopTokens.typography.h2.fontWeight,
                  fontSize: desktopTokens.typography.h2.fontSize,
                  lineHeight: desktopTokens.typography.h2.lineHeight,
                  color: desktopTokens.colors.text.primary,
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: 0,
                }}
              >
                Localization Team
              </h2>
              <p
                style={{
                  width: "100%",
                  fontFamily: desktopTokens.typography.body.fontFamily,
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "24px",
                  lineHeight: "32px",
                  color: desktopTokens.colors.text.secondary,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
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
                  padding: "24px 48px",
                  gap: "8px",
                  width: "204px",
                  height: "80px",
                  background: desktopTokens.colors.primary,
                  borderRadius: "100px",
                  border: "none",
                  cursor: "pointer",
                  flex: "none",
                  order: 1,
                  flexGrow: 0,
                }}
              >
                <span
                  style={{
                    width: "auto",
                    height: "32px",
                    fontFamily: desktopTokens.components.button.fontFamily,
                    fontStyle: "normal",
                    fontWeight: desktopTokens.components.button.fontWeight,
                    fontSize: desktopTokens.components.button.fontSize,
                    lineHeight: desktopTokens.components.button.lineHeight,
                    color: desktopTokens.colors.text.white,
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Learn More
                </span>
              </button>
            </Link>
          </div>
          {/* Image placeholder */}
          <div
            style={{
              width: "480px",
              height: "480px",
              background: "#C4C4C4",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>
      </div>

      {/* Spiritual Support Team Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "96px 120px",
          gap: "64px",
          width: "100%",
          maxWidth: desktopTokens.layout.maxWidth,
          background: desktopTokens.colors.background.light,
          flex: "none",
          alignSelf: "stretch",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            padding: "0px",
            gap: "64px",
            width: "100%",
            maxWidth: "1200px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Image placeholder */}
          <div
            style={{
              width: "480px",
              height: "480px",
              background: "#C4C4C4",
              borderRadius: "50px",
              flex: "none",
              order: 0,
              flexGrow: 0,
            }}
          />
          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: "0px",
              gap: "32px",
              flex: "none",
              order: 1,
              flexGrow: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "16px",
                width: "100%",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h2
                style={{
                  width: "100%",
                  fontFamily: desktopTokens.typography.h2.fontFamily,
                  fontStyle: "normal",
                  fontWeight: desktopTokens.typography.h2.fontWeight,
                  fontSize: desktopTokens.typography.h2.fontSize,
                  lineHeight: desktopTokens.typography.h2.lineHeight,
                  color: desktopTokens.colors.text.primary,
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: 0,
                }}
              >
                Spiritual Support Team
              </h2>
              <p
                style={{
                  width: "100%",
                  fontFamily: desktopTokens.typography.body.fontFamily,
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "24px",
                  lineHeight: "32px",
                  color: desktopTokens.colors.text.secondary,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
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
                  padding: "24px 48px",
                  gap: "8px",
                  width: "204px",
                  height: "80px",
                  background: desktopTokens.colors.primary,
                  borderRadius: "100px",
                  border: "none",
                  cursor: "pointer",
                  flex: "none",
                  order: 1,
                  flexGrow: 0,
                }}
              >
                <span
                  style={{
                    width: "auto",
                    height: "32px",
                    fontFamily: desktopTokens.components.button.fontFamily,
                    fontStyle: "normal",
                    fontWeight: desktopTokens.components.button.fontWeight,
                    fontSize: desktopTokens.components.button.fontSize,
                    lineHeight: desktopTokens.components.button.lineHeight,
                    color: desktopTokens.colors.text.white,
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
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
          padding: "96px 120px",
          gap: "64px",
          width: "100%",
          maxWidth: desktopTokens.layout.maxWidth,
          background: desktopTokens.colors.background.white,
          flex: "none",
          alignSelf: "stretch",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            padding: "0px",
            gap: "69px",
            width: "100%",
            maxWidth: "1200px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: "0px",
              gap: "32px",
              flex: "none",
              order: 0,
              flexGrow: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "16px",
                width: "100%",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h2
                style={{
                  width: "100%",
                  fontFamily: desktopTokens.typography.h2.fontFamily,
                  fontStyle: "normal",
                  fontWeight: desktopTokens.typography.h2.fontWeight,
                  fontSize: desktopTokens.typography.h2.fontSize,
                  lineHeight: desktopTokens.typography.h2.lineHeight,
                  color: desktopTokens.colors.text.primary,
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: 0,
                }}
              >
                Technical Support Team
              </h2>
              <p
                style={{
                  width: "100%",
                  fontFamily: desktopTokens.typography.body.fontFamily,
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "24px",
                  lineHeight: "32px",
                  color: desktopTokens.colors.text.secondary,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
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
                  padding: "24px 48px",
                  gap: "8px",
                  width: "204px",
                  height: "80px",
                  background: desktopTokens.colors.primary,
                  borderRadius: "100px",
                  border: "none",
                  cursor: "pointer",
                  flex: "none",
                  order: 1,
                  flexGrow: 0,
                }}
              >
                <span
                  style={{
                    width: "auto",
                    height: "32px",
                    fontFamily: desktopTokens.components.button.fontFamily,
                    fontStyle: "normal",
                    fontWeight: desktopTokens.components.button.fontWeight,
                    fontSize: desktopTokens.components.button.fontSize,
                    lineHeight: desktopTokens.components.button.lineHeight,
                    color: desktopTokens.colors.text.white,
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Learn More
                </span>
              </button>
            </Link>
          </div>
          {/* Image placeholder */}
          <div
            style={{
              width: "480px",
              height: "480px",
              background: "#C4C4C4",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}
