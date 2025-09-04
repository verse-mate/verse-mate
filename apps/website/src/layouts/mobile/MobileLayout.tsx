/**
 * Mobile-specific layout component
 */

import React, { type ReactNode } from "react";
import { mobileTokens } from "../../styles/tokens/mobile.tokens";

interface MobileLayoutProps {
  children: ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        backgroundColor: mobileTokens.colors.background.white,
        fontFamily: mobileTokens.typography.body.fontFamily,
      }}
      data-testid="mobile-layout"
    >
      {/* Mobile Header Placeholder - will be replaced with adaptive component */}
      <header
        style={{
          height: mobileTokens.layout.headerHeight,
          padding: mobileTokens.components.nav.padding,
          backgroundColor: mobileTokens.colors.background.white,
          borderBottom: `1px solid ${mobileTokens.colors.gray}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 1000,
        }}
        data-testid="mobile-header"
      >
        {/* Logo */}
        <div
          style={{
            fontFamily: mobileTokens.typography.h2.fontFamily,
            fontSize: "16px",
            fontWeight: 400,
            letterSpacing: "0.1em",
            color: mobileTokens.colors.text.primary,
            flexShrink: 0,
            minWidth: "fit-content",
          }}
        >
          VERSE|MATE
        </div>

        {/* Mobile Menu Button */}
        <button
          style={{
            width: "44px",
            height: "44px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Open menu"
          data-testid="mobile-menu-button"
        >
          {/* Hamburger Icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12H21M3 6H21M3 18H21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          width: "100%",
        }}
        data-testid="mobile-main"
      >
        {children}
      </main>

      {/* Mobile Footer Placeholder - will be replaced with adaptive component */}
      <footer
        style={{
          minHeight: mobileTokens.layout.footerHeight,
          padding: mobileTokens.layout.containerPadding,
          backgroundColor: mobileTokens.colors.background.dark,
          color: mobileTokens.colors.text.white,
        }}
        data-testid="mobile-footer"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: mobileTokens.spacing.md,
          }}
        >
          <div
            style={{
              fontFamily: mobileTokens.typography.body.fontFamily,
              fontSize: "14px",
              fontWeight: 400,
              letterSpacing: "0.1em",
            }}
          >
            VERSE|MATE
          </div>
        </div>
      </footer>
    </div>
  );
}
