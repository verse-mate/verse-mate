"use client";

import Link from "next/link";
import Image from "next/image";

export default function Header() {
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px 64px",
        width: "1024px",
        height: "76px",
        background: "#FFFFFF",
        flex: "none",
        order: 0,
        alignSelf: "stretch",
        flexGrow: 0,
        margin: "0 auto",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: "175px",
          height: "48px",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            padding: "0",
            margin: "0",
            position: "relative",
          }}
        >
          <Image
            src="/versemate-logo.png"
            alt="VerseMate"
            width={175}
            height={48}
            style={{
              objectFit: "contain",
            }}
          />
        </Link>
      </div>

      {/* Button */}
      <Link
        href="/volunteer"
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          padding: "16px 32px",
          gap: "8px",
          width: "208px",
          height: "56px",
          background: "#000000",
          borderRadius: "100px",
          flex: "none",
          order: 1,
          flexGrow: 0,
          border: "none",
          cursor: "pointer",
          textDecoration: "none",
        }}
      >
        <span
          style={{
            width: "145px",
            height: "24px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 400,
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
      </Link>

      {/* Menu - Hidden for tablet as per Figma design */}
      <nav
        style={{
          display: "none",
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0px",
          gap: "48px",
          width: "437px",
          height: "76px",
          flex: "none",
          order: 1,
          flexGrow: 0,
        }}
      ></nav>
    </header>
  );
}