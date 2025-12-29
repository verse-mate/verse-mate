import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      className="relative"
      style={{
        width: "100vw",
        height: "900px",
        background: "linear-gradient(111.34deg, #000000 0%, #936E2B 100%)",
        backgroundBlendMode: "multiply",
        borderRadius: "0px",
        flex: "none",
        order: 0,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {/* Text Pattern Overlay - full width */}
      <div
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          left: "0",
          top: "0",
          backgroundImage: "url(/Tilted%20image%20text%20Desktop.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 1,
        }}
      />

      {/* Content Container - maintains 1440px layout */}
      <div
        style={{
          position: "relative",
          width: "1440px",
          height: "100%",
          margin: "0 auto",
        }}
      >
        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "32px 120px",
            gap: "16px",
            isolation: "isolate",
            position: "absolute",
            height: "752px",
            left: "0px",
            right: "0px",
            top: "76px",
          }}
        >
          {/* Main Heading */}
          <h1
            style={{
              width: "540px",
              height: "192px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "48px",
              lineHeight: "64px",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              flexGrow: 0,
              zIndex: 0,
            }}
          >
            The Bible Was Meant to Be Understood - Not Just Read.
          </h1>

          {/* Description Text */}
          <p
            style={{
              width: "540px",
              height: "128px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
              color: "#FFFFFF",
              flex: "none",
              order: 1,
              flexGrow: 0,
              zIndex: 1,
            }}
          >
            When people truly understand Scripture, lives change. Versemate helps
            anyone, anywhere, connect with God&rsquo;s Word clearly - and grow
            deeper in faith.
          </p>

          {/* Button Container */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              padding: "24px 0px",
              gap: "24px",
              width: "436px",
              height: "128px",
              flex: "none",
              order: 2,
              flexGrow: 0,
              zIndex: 2,
            }}
          >
            {/* Primary Button - Try Versemate (outline) */}
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateToApp();
              }}
              style={{
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                padding: "24px 32px",
                gap: "8px",
                width: "206px",
                height: "80px",
                border: "2px solid #FFFFFF",
                borderRadius: "100px",
                flex: "none",
                order: 0,
                flexGrow: 0,
                textDecoration: "none",
                cursor: "pointer",
                background: "transparent",
              }}
            >
              <span
                style={{
                  width: "142px",
                  height: "32px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 600,
                  fontSize: "20px",
                  lineHeight: "32px",
                  color: "#FFFFFF",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              >
                Try Versemate
              </span>
            </Link>

            {/* Secondary Button - Get the app (solid) */}
            <Link
              href="/download-app"
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                padding: "24px 32px",
                gap: "8px",
                width: "206px",
                height: "80px",
                background: "#FFFFFF",
                borderRadius: "100px",
                flex: "none",
                order: 1,
                flexGrow: 0,
                textDecoration: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: "113px",
                  height: "32px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 600,
                  fontSize: "20px",
                  lineHeight: "32px",
                  color: "#000000",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Get the app
              </span>
            </Link>
          </div>
        </div>

        {/* Text Line */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            padding: "0px",
            gap: "8px",
            position: "absolute",
            width: "1440px",
            height: "32px",
            left: "calc(50% - 1440px/2)",
            bottom: "72px",
            flex: "none",
            order: 3,
            flexGrow: 0,
            zIndex: 3,
          }}
        >
          <span
            style={{
              width: "561px",
              height: "32px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
              textAlign: "center",
              letterSpacing: "0.2em",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              flexGrow: 0,
              whiteSpace: "nowrap",
            }}
          >
            Always free. For everyone. Forever.
          </span>
        </div>
      </div>

      {/* Hero Image - positioned relative to full section to extend beyond viewport */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          isolation: "isolate",
          position: "absolute",
          width: "776px",
          height: "1033px",
          right: "45px",
          top: "115px",
          flex: "none",
          order: 3,
          flexGrow: 0,
        }}
      >
        {/* Shadow */}
        <div
          style={{
            position: "absolute",
            width: "776px",
            height: "25px",
            right: "-0.41px",
            top: "510px",
            background: "rgba(0, 0, 0, 0.75)",
            filter: "blur(20px)",
            flex: "none",
            order: 0,
            flexGrow: 0,
            zIndex: 0,
          }}
        />
        {/* Hero Image Container */}
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            width: "820px",
            height: "1033px",
            right: "-80px",
            top: "90px",
            zIndex: 10,
          }}
        >
          {/* Background iPad View - Largest */}
          <img
            src="/ipad.png"
            alt="Desktop View"
            style={{
              position: "absolute",
              right: "0px",
              top: "0px",
              width: "100%",
              height: "auto",
              zIndex: 10,
            }}
          />

          {/* Middle Bible Reader View - Overlapping Left */}
          <img
            src="/bibleReader.png"
            alt="Bible Reader View"
            style={{
              position: "absolute",
              left: "15%",
              top: "8%",
              zIndex: 20,
            }}
          />

          {/* Front Summary View - Overlapping Right */}
          <img
            src="/summary.png"
            alt="Summary View"
            style={{
              position: "absolute",
              left: "36%",
              top: "15%",
              zIndex: 30,
            }}
          />
        </div>
      </div>
    </section>
  );
}