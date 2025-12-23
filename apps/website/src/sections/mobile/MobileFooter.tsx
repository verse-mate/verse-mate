"use client";

import Link from "next/link";
import Image from "next/image";

export default function MobileFooter() {
  return (
    <footer
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "48px 16px",
        width: "440px",
        height: "100px",
        background: "#1B1B1B",
        flex: "none",
        order: 7,
        alignSelf: "stretch",
        flexGrow: 0,
        margin: "0 auto",
        maxWidth: "100vw",
      }}
    >
      {/* pageLinks */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0px",
          gap: "24px",
          width: "312px",
          height: "34px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: "100px",
            height: "28px",
            flex: "none",
            order: 0,
            flexGrow: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              position: "relative",
            }}
          >
            <Image
              src="/versemate-logo.png"
              alt="VerseMate"
              width={100}
              height={28}
              style={{
                objectFit: "contain",
                filter: "brightness(0) invert(1)",
              }}
            />
          </Link>
        </div>

        {/* Privacy Policy Link */}
        <Link
          href="/privacy"
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: "12px",
            lineHeight: "20px",
            color: "#FFFFFF",
            textDecoration: "none",
            flex: "none",
            order: 1,
            flexGrow: 0,
          }}
        >
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
