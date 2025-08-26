/**
 * Tablet-specific layout component
 */

import React, { type ReactNode } from "react";
import { tabletTokens } from "../../styles/tokens/tablet.tokens";

interface TabletLayoutProps {
  children: ReactNode;
}

export default function TabletLayout({ children }: TabletLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        maxWidth: tabletTokens.layout.maxWidth,
        margin: "0 auto",
        backgroundColor: tabletTokens.colors.background.white,
        fontFamily: tabletTokens.typography.body.fontFamily,
      }}
      data-testid="tablet-layout"
    >
      {/* Tablet Header Placeholder */}
      <header
        style={{
          height: tabletTokens.layout.headerHeight,
          padding: tabletTokens.components.nav.padding,
          backgroundColor: tabletTokens.colors.background.white,
          borderBottom: `1px solid ${tabletTokens.colors.gray}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 1000,
        }}
        data-testid="tablet-header"
      >
        {/* Logo */}
        <div
          style={{
            fontFamily: tabletTokens.typography.h2.fontFamily,
            fontSize: "18px",
            fontWeight: 400,
            letterSpacing: "0.1em",
            color: tabletTokens.colors.text.primary,
          }}
        >
          VERSE|MATE
        </div>

        {/* Tablet Navigation */}
        <nav
          style={{
            display: "flex",
            gap: tabletTokens.spacing.lg,
            alignItems: "center",
          }}
        >
          <a
            href="/volunteer"
            style={{
              fontSize: tabletTokens.typography.body.fontSize,
              fontWeight: 400,
              color: tabletTokens.colors.text.primary,
              textDecoration: "none",
            }}
          >
            Volunteer
          </a>
          <a
            href="/about"
            style={{
              fontSize: tabletTokens.typography.body.fontSize,
              fontWeight: 400,
              color: tabletTokens.colors.text.primary,
              textDecoration: "none",
            }}
          >
            About
          </a>
        </nav>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          width: "100%",
        }}
        data-testid="tablet-main"
      >
        {children}
      </main>

      {/* Tablet Footer Placeholder */}
      <footer
        style={{
          minHeight: tabletTokens.layout.footerHeight,
          padding: tabletTokens.layout.containerPadding,
          backgroundColor: tabletTokens.colors.background.dark,
          color: tabletTokens.colors.text.white,
        }}
        data-testid="tablet-footer"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: tabletTokens.spacing.lg,
          }}
        >
          <div
            style={{
              fontFamily: tabletTokens.typography.body.fontFamily,
              fontSize: "16px",
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
