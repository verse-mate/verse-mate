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
        gap: "794px",
        position: "absolute",
        height: "76px",
        left: "0px",
        right: "0px",
        top: "0px",
        flex: "none",
        order: 8,
        flexGrow: 0,
        zIndex: 8,
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
              filter: "brightness(0) invert(1)",
            }}
          />
        </Link>
      </div>

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
      >
      </nav>
    </header>
  );
}