"use client";

import { navigateToLogin } from "@/lib/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      data-header="desktop"
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px 64px",
        position: "absolute",
        height: "76px",
        width: "1440px",
        left: "50%",
        transform: "translateX(-50%)",
        top: "0px",
        zIndex: 8,
        background: "transparent",
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
            color: "#FFFFFF",
            textDecoration: "none",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontWeight: 400,
            fontSize: "18px",
            letterSpacing: "0.15em",
            display: "flex",
            alignItems: "center",
            height: "100%",
            padding: "0",
            margin: "0",
            position: "relative",
          }}
        >
          <span style={{ paddingRight: "3px" }}>VERSE</span>
          <div
            style={{
              width: "1px",
              height: "32px",
              backgroundColor: "#FFFFFF",
              position: "relative",
              top: "0px",
            }}
          />
          <span style={{ paddingLeft: "6px" }}>MATE</span>
        </Link>
      </div>

      {/* Menu */}
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
        {/* Home Menu Item */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "6px 0px 0px",
            gap: "4px",
            width: "46px",
            height: "76px",
            flex: "none",
            order: 0,
            flexGrow: 0,
          }}
        >
          <Link
            href="/"
            style={{
              width: "46px",
              height: "24px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "24px",
              color: isScrolled ? "#FFFFFF" : "#000000",
              opacity: 0.6,
              flex: "none",
              order: 0,
              flexGrow: 0,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Home
          </Link>
          <div
            style={{
              width: "0px",
              height: "2px",
              background: "#FFFFFF",
              borderRadius: "2px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>

        {/* Volunteer Menu Item */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "6px 0px 0px",
            gap: "4px",
            width: "74px",
            height: "76px",
            flex: "none",
            order: 1,
            flexGrow: 0,
          }}
        >
          <Link
            href="/volunteer"
            style={{
              width: "74px",
              height: "24px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "24px",
              color: isScrolled ? "#FFFFFF" : "#000000",
              opacity: 0.6,
              flex: "none",
              order: 0,
              flexGrow: 0,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Volunteer
          </Link>
          <div
            style={{
              width: "0px",
              height: "2px",
              background: "#FFFFFF",
              borderRadius: "2px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>

        {/* Give Menu Item */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "6px 0px 0px",
            gap: "4px",
            width: "35px",
            height: "76px",
            flex: "none",
            order: 2,
            flexGrow: 0,
          }}
        >
          <Link
            href="/give"
            style={{
              width: "35px",
              height: "24px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "24px",
              color: isScrolled ? "#FFFFFF" : "#000000",
              opacity: 0.6,
              flex: "none",
              order: 0,
              flexGrow: 0,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Give
          </Link>
          <div
            style={{
              width: "0px",
              height: "2px",
              background: "#FFFFFF",
              borderRadius: "2px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>

        {/* About Menu Item */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "6px 0px 0px",
            gap: "4px",
            width: "47px",
            height: "76px",
            flex: "none",
            order: 3,
            flexGrow: 0,
          }}
        >
          <Link
            href="/about"
            style={{
              width: "47px",
              height: "24px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "24px",
              color: isScrolled ? "#FFFFFF" : "#000000",
              opacity: 0.6,
              flex: "none",
              order: 0,
              flexGrow: 0,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            About
          </Link>
          <div
            style={{
              width: "0px",
              height: "2px",
              background: "#FFFFFF",
              borderRadius: "2px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>

        {/* Login Menu Item */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "6px 0px 0px",
            gap: "4px",
            width: "43px",
            height: "76px",
            flex: "none",
            order: 4,
            flexGrow: 0,
          }}
        >
          <button
            onClick={() => navigateToLogin()}
            style={{
              width: "43px",
              height: "24px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: "16px",
              lineHeight: "24px",
              color: isScrolled ? "#FFFFFF" : "#000000",
              opacity: 0.6,
              flex: "none",
              order: 0,
              flexGrow: 0,
              textDecoration: "none",
              textAlign: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            Login
          </button>
          <div
            style={{
              width: "0px",
              height: "2px",
              background: "#FFFFFF",
              borderRadius: "2px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          />
        </div>
      </nav>
    </header>
  );
}
