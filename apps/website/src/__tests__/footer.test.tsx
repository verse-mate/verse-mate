/**
 * Footer Component Tests
 *
 * These tests verify the Footer components across all device variants:
 * - Desktop Footer contains "Privacy Policy" link pointing to /privacy
 * - Tablet Footer contains "Privacy Policy" link pointing to /privacy
 * - Mobile Footer contains "Privacy Policy" link pointing to /privacy
 *
 * Note: To run these tests, a test framework (Jest/Vitest + React Testing Library)
 * needs to be configured for the website app.
 */

import React from "react";

// Mock Next.js components
jest.mock("next/link", () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

jest.mock("next/image", () => {
  return ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  );
});

import { render, screen } from "@testing-library/react";
import DesktopFooter from "../sections/desktop/Footer";
import TabletFooter from "../sections/tablet/Footer";
import MobileFooter from "../sections/mobile/MobileFooter";

describe("Footer Components", () => {
  describe("Desktop Footer", () => {
    beforeEach(() => {
      render(<DesktopFooter />);
    });

    it("contains Privacy Policy link pointing to /privacy", () => {
      const privacyLink = screen.getByRole("link", { name: /Privacy Policy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute("href", "/privacy");
    });
  });

  describe("Tablet Footer", () => {
    beforeEach(() => {
      render(<TabletFooter />);
    });

    it("contains Privacy Policy link pointing to /privacy", () => {
      const privacyLink = screen.getByRole("link", { name: /Privacy Policy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute("href", "/privacy");
    });
  });

  describe("Mobile Footer", () => {
    beforeEach(() => {
      render(<MobileFooter />);
    });

    it("contains Privacy Policy link pointing to /privacy", () => {
      const privacyLink = screen.getByRole("link", { name: /Privacy Policy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute("href", "/privacy");
    });
  });
});
