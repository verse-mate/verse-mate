import { navigateToLogin } from "@/lib/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleScroll = () => {
        setIsScrolled(window.scrollY > 0);
      };

      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <header
      data-header="main"
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px clamp(16px, 4vw, 64px)",
        position: "absolute",
        height: "76px",
        left: "0px",
        right: "0px",
        top: "0px",
        flex: "none",
        order: 8,
        flexGrow: 0,
        zIndex: 8,
        background: isScrolled ? "rgba(0, 0, 0, 0.8)" : "#FFFFFF",
        minWidth: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          flex: "0 0 auto",
          minWidth: "120px",
          height: "48px",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "14px",
            letterSpacing: "0.15em",
            color: isScrolled ? "#FFFFFF" : "#000000",
            textDecoration: "none",
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
              height: "28px",
              backgroundColor: isScrolled ? "#FFFFFF" : "#000000",
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
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0px",
          gap: "clamp(24px, 4vw, 48px)",
          flex: "0 0 auto",
          height: "76px",
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
          <a
            href="mailto:info@versemate.org?subject=I want to volunteer&body=Hi, I'm interested in helping with VerseMate..."
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
          </a>
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
