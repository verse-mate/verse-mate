/**
 * Desktop-specific layout component (existing implementation)
 */

import React, { type ReactNode } from "react";
import { desktopTokens } from "../../styles/tokens/desktop.tokens";

interface DesktopLayoutProps {
  children: ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        maxWidth: desktopTokens.layout.maxWidth,
        margin: "0 auto",
        backgroundColor: desktopTokens.colors.background.white,
        fontFamily: desktopTokens.typography.body.fontFamily,
      }}
      data-testid="desktop-layout"
    >
      {/* Desktop Header Placeholder - current implementation */}
      <header
        style={{
          height: desktopTokens.layout.headerHeight,
          padding: desktopTokens.components.nav.padding,
          backgroundColor: desktopTokens.colors.background.white,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: "100vw",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
        data-testid="desktop-header"
      >
        {/* Logo */}
        <div
          style={{
            fontFamily: desktopTokens.typography.body.fontFamily,
            fontSize: "14px",
            fontWeight: 400,
            letterSpacing: "0.1em",
            color: desktopTokens.colors.text.primary,
            flexShrink: 0,
            minWidth: "fit-content",
          }}
        >
          VERSE|MATE
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          width: "100%",
        }}
        data-testid="desktop-main"
      >
        {children}
      </main>

      {/* Desktop Footer Placeholder - current implementation */}
      <footer
        style={{
          height: desktopTokens.layout.footerHeight,
          padding: `48px ${desktopTokens.layout.containerPadding}`,
          backgroundColor: desktopTokens.colors.background.dark,
          color: desktopTokens.colors.text.white,
        }}
        data-testid="desktop-footer"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: desktopTokens.typography.body.fontFamily,
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
