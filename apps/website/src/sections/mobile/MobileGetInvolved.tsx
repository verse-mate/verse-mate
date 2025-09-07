"use client";

import Link from "next/link";

export default function MobileGetInvolved() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
        gap: "48px",
        width: "440px",
        height: "1512px",
        background: "linear-gradient(180deg, #1B1B1B 0%, #000000 100%)",
        flex: "none",
        order: 4,
        alignSelf: "stretch",
        flexGrow: 0,
        margin: "0 auto",
        maxWidth: "100vw",
      }}
    >
      {/* Title */}
      <div
        style={{
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          padding: "8px 0px",
          gap: "8px",
          width: "136px",
          height: "40px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "136px",
            height: "24px",
            fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "16px",
            lineHeight: "24px",
            textAlign: "center",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            flexGrow: 0,
            whiteSpace: "nowrap",
          }}
        >
          Get Involved
        </span>
      </div>

      {/* Group of cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          gap: "40px",
          width: "392px",
          height: "1160px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Volunteer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            width: "392px",
            height: "572px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Volunteer Title */}
          <h2
            style={{
              width: "392px",
              height: "40px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "32px",
              lineHeight: "40px",
              textAlign: "center",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Volunteer
          </h2>

          {/* Content */}
          <div
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px 0px 40px",
              gap: "40px",
              width: "392px",
              height: "508px",
              background: "rgba(255, 255, 255, 0.1)",
              boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "392px",
                height: "196px",
                backgroundImage: "url(/volunteer.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "40px 40px 0px 0px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            />

            {/* Text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 24px",
                gap: "16px",
                width: "392px",
                height: "136px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "344px",
                  height: "48px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "20px",
                  lineHeight: "24px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Want to Help People Understand the Bible?
              </h3>
              <p
                style={{
                  width: "344px",
                  height: "72px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 300,
                  fontSize: "16px",
                  lineHeight: "24px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  opacity: 0.5,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                We're looking for developers, testers, translators, and people
                of faith who want to make an eternal impact.
              </p>
            </div>

            {/* Button Container */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 32px",
                gap: "8px",
                width: "392px",
                height: "56px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <a
                href="mailto:info@versemate.org?subject=I want to volunteer&body=Hi, I'm interested in helping with VerseMate..."
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "16px 24px",
                  gap: "8px",
                  width: "328px",
                  height: "56px",
                  background: "#C2B291",
                  borderRadius: "100px",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: "188px",
                    height: "24px",
                    fontFamily:
                      "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 600,
                    fontSize: "16px",
                    lineHeight: "24px",
                    color: "#000000",
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Join the Volunteer Team
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Give */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            width: "392px",
            height: "548px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Give Title */}
          <h2
            style={{
              width: "392px",
              height: "40px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "32px",
              lineHeight: "40px",
              textAlign: "center",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Give
          </h2>

          {/* Content */}
          <div
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px 0px 40px",
              gap: "40px",
              width: "392px",
              height: "484px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "392px",
                height: "196px",
                backgroundImage: "url(/give.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "40px 40px 0px 0px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            />

            {/* Text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 24px",
                gap: "16px",
                width: "392px",
                height: "112px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "344px",
                  height: "24px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "20px",
                  lineHeight: "24px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Believe in the Mission?
              </h3>
              <p
                style={{
                  width: "344px",
                  height: "72px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 300,
                  fontSize: "16px",
                  lineHeight: "24px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  opacity: 0.5,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Your gift keeps Versemate 100% free and accessible to people
                around the world seeking to understand God's Word.
              </p>
            </div>

            {/* Button Container */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 32px",
                gap: "8px",
                width: "392px",
                height: "56px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <a
                href="mailto:donations@versemate.org?subject=I want to make a donation&body=Hi, I'm interested in supporting VerseMate with a donation..."
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "16px 24px",
                  gap: "8px",
                  width: "328px",
                  height: "56px",
                  background: "#C2B291",
                  borderRadius: "100px",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: "130px",
                    height: "24px",
                    fontFamily:
                      "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 600,
                    fontSize: "16px",
                    lineHeight: "24px",
                    color: "#000000",
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Make a Donation
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: "0px",
            width: "392px",
            height: "96px",
            flex: "none",
            order: 2,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          <p
            style={{
              width: "392px",
              height: "48px",
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "24px",
              textAlign: "center",
              color: "#C2B291",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0 0 24px 0",
            }}
          >
            Versemate is a 501(c)(3) nonprofit making the
            <br />
            Bible easier to understand - for everyone, forever.
          </p>
          <p
            style={{
              width: "392px",
              height: "48px",
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "14px",
              lineHeight: "24px",
              textAlign: "center",
              color: "#FFFFFF",
              opacity: 0.5,
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Donations are tax-deductible in the U.S.
            <br />
            Built by believers. Guided by the Word.
          </p>
        </div>
      </div>
    </section>
  );
}
