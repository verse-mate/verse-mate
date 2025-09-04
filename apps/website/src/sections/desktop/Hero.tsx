import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      className="relative"
      style={{
        width: "1440px",
        height: "900px",
        background: "linear-gradient(111.34deg, #000000 0%, #936E2B 100%)",
        backgroundBlendMode: "multiply",
        borderRadius: "0px",
        flex: "none",
        order: 0,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 0,
        margin: "0 auto",
        overflow: "hidden",
      }}
    >
      {/* Text Pattern Overlay */}
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
            fontFamily: "var(--font-merriweather)",
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
              textDecoration: "none",
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
          <a
            href="mailto:info@versemate.org?subject=I want to volunteer&body=Hi, I'm interested in helping with VerseMate..."
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
                width: "184px",
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
                whiteSpace: "nowrap",
              }}
            >
              Join as a Volunteer
            </span>
          </a>
        </div>
      </div>

      {/* Hero Image */}
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
          right: "-38px",
          top: "115px",
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

        {/* iPad */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "8px",
            gap: "8px",
            width: "776px",
            height: "516px",
            background: "rgba(0, 0, 0, 0.001)",
            borderRadius: "32px",
            border: "0.5px solid #D4B896",
            flex: "none",
            order: 1,
            flexGrow: 0,
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "760px",
              height: "500px",
              backgroundImage: "url(/ipad.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "24px",
              flex: "none",
              order: 0,
              flexGrow: 0,
            }}
          />
        </div>

        {/* iPad Reflection */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "8px",
            gap: "8px",
            width: "776px",
            height: "517px",
            background: "rgba(0, 0, 0, 0.001)",
            opacity: 0.05,
            borderRadius: "32px",
            transform: "matrix(1, 0, 0, -1, 0, 0)",
            flex: "none",
            order: 2,
            flexGrow: 0,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: "760px",
              height: "501px",
              backgroundImage: "url(/ipad.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "24px",
              transform: "matrix(1, 0, 0, -1, 0, 0)",
              flex: "none",
              order: 0,
              flexGrow: 0,
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
          top: "828px",
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
    </section>
  );
}
