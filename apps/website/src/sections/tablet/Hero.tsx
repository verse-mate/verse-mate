import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      style={{
        position: "relative",
        width: "1024px",
        height: "1231px",
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
      {/* Tilted Image */}
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

      {/* Content - full width, centered */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "80px 64px 0px",
          gap: "16px",
          isolation: "isolate",
          position: "absolute",
          height: "432px",
          left: "0px",
          right: "0px",
          top: "76px",
        }}
      >
        {/* Main Heading - full width */}
        <h1
          style={{
            width: "896px",
            height: "128px",
            fontFamily: "var(--font-merriweather, Merriweather, serif)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "48px",
            lineHeight: "64px",
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
            zIndex: 0,
          }}
        >
          The Bible Was Meant to Be Understood - Not Just Read.
        </h1>

        {/* Description Text - full width */}
        <p
          style={{
            width: "896px",
            height: "84px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "24px",
            lineHeight: "32px",
            color: "#FFFFFF",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
            zIndex: 1,
          }}
        >
          When people truly understand Scripture, lives change. Versemate helps
          anyone, anywhere, connect with God&rsquo;s Word clearly - and grow
          deeper in faith.
        </p>

        {/* Button Container - horizontal layout */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            padding: "24px 0px",
            gap: "24px",
            width: "478px",
            height: "128px",
            flex: "none",
            order: 2,
            flexGrow: 0,
            zIndex: 2,
          }}
        >
          {/* Primary Button */}
          <button
            onClick={() => navigateToApp()}
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
              order: 0,
              flexGrow: 0,
              border: "none",
              cursor: "pointer",
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
                color: "#000000",
                flex: "none",
                order: 0,
                flexGrow: 0,
              }}
            >
              Try Versemate
            </span>
          </button>

          {/* Secondary Button */}
          <Link
            href="/volunteer"
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              padding: "24px 32px",
              gap: "8px",
              width: "248px",
              height: "80px",
              border: "2px solid #FFFFFF",
              borderRadius: "100px",
              flex: "none",
              order: 1,
              flexGrow: 0,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: "200px",
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
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Join as a Volunteer
            </span>
          </Link>
        </div>
      </div>

      {/* Hero Image - positioned at bottom center like in required screenshot */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          isolation: "isolate",
          position: "absolute",
          width: "896px",
          height: "1193px",
          right: "64px",
          top: "518px",
          flex: "none",
          order: 3,
          flexGrow: 0,
          zIndex: 3,
        }}
      >
        {/* Shadow */}
        <div
          style={{
            position: "absolute",
            width: "896px",
            height: "25px",
            right: "0px",
            top: "582px",
            background: "rgba(0, 0, 0, 0.75)",
            filter: "blur(20px)",
            flex: "none",
            order: 0,
            flexGrow: 0,
            zIndex: 0,
          }}
        />

        {/* iPad */}
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
            right: "50px",
            top: "75px",
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
          height: "32px",
          left: "0px",
          right: "0px",
          top: "1159px",
        }}
      >
        <span
          style={{
            width: "580px",
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
          }}
        >
          Always free. For everyone. Forever.
        </span>
      </div>
    </section>
  );
}