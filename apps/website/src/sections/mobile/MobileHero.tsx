"use client";

import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";

export default function MobileHero() {
  return (
    <section
      style={{
        width: "440px",
        height: "901px",
        background: "linear-gradient(111.34deg, #000000 0%, #936E2B 100%)",
        backgroundBlendMode: "multiply",
        borderRadius: "0px",
        flex: "none",
        order: 0,
        alignSelf: "stretch",
        flexGrow: 0,
        position: "relative",
        margin: "0 auto",
        maxWidth: "100vw",
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
          backgroundImage: "url(/Tilted%20Image%20text%20Mobile.png)",
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
          alignItems: "flex-start",
          padding: "80px 24px 0px",
          gap: "16px",
          isolation: "isolate",
          position: "absolute",
          height: "432px",
          left: "0px",
          right: "0px",
          top: "76px",
        }}
      >
        {/* Main Heading */}
        <h1
          style={{
            width: "392px",
            height: "120px",
            fontFamily: "var(--font-merriweather, Merriweather, serif)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "32px",
            lineHeight: "40px",
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
            zIndex: 0,
            margin: "0",
          }}
        >
          The Bible Was Meant to
          <br />
          Be Understood -<br />
          Not Just Read.
        </h1>

        {/* Description Text */}
        <p
          style={{
            width: "392px",
            height: "96px",
            fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
            fontStyle: "normal",
            fontWeight: 200,
            fontSize: "16px",
            lineHeight: "24px",
            color: "#FFFFFF",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
            zIndex: 1,
            margin: "0",
          }}
        >
          When people truly understand Scripture, lives change. Versemate helps
          anyone, anywhere, connect with God's Word clearly - and grow deeper in
          faith.
        </p>

        {/* Button Container */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            padding: "24px 0px",
            gap: "24px",
            width: "392px",
            height: "104px",
            flex: "none",
            order: 2,
            alignSelf: "stretch",
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
              padding: "16px 24px",
              gap: "8px",
              width: "184px",
              height: "56px",
              background: "#FFFFFF",
              borderRadius: "100px",
              flex: "none",
              order: 0,
              flexGrow: 1,
              border: "none",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: "114px",
                height: "24px",
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
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
              padding: "16px 24px",
              gap: "8px",
              width: "184px",
              height: "56px",
              border: "2px solid #FFFFFF",
              borderRadius: "100px",
              flex: "none",
              order: 1,
              flexGrow: 1,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: "148px",
                height: "24px",
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#FFFFFF",
                flex: "none",
                order: 0,
                flexGrow: 0,
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
          width: "392px",
          height: "528px",
          right: "24px",
          top: "524px",
        }}
      >
        {/* Shadow */}
        <div
          style={{
            position: "absolute",
            width: "392px",
            height: "11px",
            left: "calc(50% - 392px/2)",
            top: "264px",
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
            width: "392px",
            height: "264px",
            background: "rgba(0, 0, 0, 0.001)",
            borderRadius: "16px",
            border: "0.5px solid #D4B896",
            flex: "none",
            order: 1,
            flexGrow: 0,
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "376px",
              height: "248px",
              backgroundImage: "url(/ipad.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "8px",
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
            width: "392px",
            height: "264px",
            background: "rgba(0, 0, 0, 0.001)",
            opacity: 0.05,
            borderRadius: "16px",
            border: "0.5px solid rgba(212, 184, 150, 0.3)",
            transform: "scaleY(-1)",
            flex: "none",
            order: 2,
            flexGrow: 0,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: "376px",
              height: "248px",
              backgroundImage: "url(/ipad.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "8px",
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
          bottom: "40px",
        }}
      >
        <span
          style={{
            width: "374px",
            height: "24px",
            fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "16px",
            lineHeight: "24px",
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
