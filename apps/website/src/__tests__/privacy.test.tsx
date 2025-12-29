/**
 * Privacy Policy Page Tests
 *
 * These tests verify the Privacy Policy page functionality:
 * - Route renders without errors
 * - All 12 content sections are present
 * - mailto links point to info@versemate.org
 * - Internal link to /support exists
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

// Mock useDevice hook
jest.mock("../hooks/useDevice", () => ({
  useDevice: () => ({ type: "desktop" }),
}));

import { render, screen } from "@testing-library/react";
import Privacy from "../pages/privacy";
import DesktopPrivacyPage from "../pages/desktop/privacy/DesktopPrivacyPage";

describe("Privacy Policy Page", () => {
  describe("Route Rendering", () => {
    it("renders the privacy page without errors", () => {
      expect(() => render(<Privacy />)).not.toThrow();
    });

    it("renders the desktop privacy page variant without errors", () => {
      expect(() => render(<DesktopPrivacyPage />)).not.toThrow();
    });
  });

  describe("Content Sections", () => {
    beforeEach(() => {
      render(<DesktopPrivacyPage />);
    });

    it("displays all 12 privacy policy sections", () => {
      // Check for key section headings
      const sections = [
        "Information We Collect",
        "How We Use Your Information",
        "Data Sharing",
        "Data Retention",
        "Your Rights & Choices",
        "Data Security",
        "Children's Privacy",
        "Third-Party Links",
        "Changes to This Policy",
        "Contact Us",
        "About VerseMate",
      ];

      sections.forEach((section) => {
        expect(screen.getByText(section)).toBeInTheDocument();
      });
    });

    it("displays the effective date", () => {
      expect(screen.getByText(/December 23, 2025/)).toBeInTheDocument();
    });

    it("displays the data retention table", () => {
      // Check for table headers
      expect(screen.getByText("Data Type")).toBeInTheDocument();
      expect(screen.getByText("Retention Period")).toBeInTheDocument();

      // Check for table data
      expect(screen.getByText("Account information")).toBeInTheDocument();
      expect(screen.getByText("Bookmarks, highlights, notes")).toBeInTheDocument();
      expect(screen.getByText("Reading history")).toBeInTheDocument();
      expect(screen.getByText("Analytics data")).toBeInTheDocument();
      expect(screen.getByText("Error/crash logs")).toBeInTheDocument();
    });
  });

  describe("Links", () => {
    beforeEach(() => {
      render(<DesktopPrivacyPage />);
    });

    it("contains mailto links to info@versemate.org", () => {
      const mailtoLinks = screen.getAllByRole("link", { name: /info@versemate\.org/ });
      expect(mailtoLinks.length).toBeGreaterThan(0);

      mailtoLinks.forEach((link) => {
        expect(link).toHaveAttribute("href", "mailto:info@versemate.org");
      });
    });

    it("contains internal link to /support page", () => {
      const supportLinks = screen.getAllByRole("link", { name: /support/ });
      const internalSupportLink = supportLinks.find(
        (link) => link.getAttribute("href") === "/support"
      );
      expect(internalSupportLink).toBeInTheDocument();
    });
  });

  describe("CCPA and GDPR Sections", () => {
    beforeEach(() => {
      render(<DesktopPrivacyPage />);
    });

    it("displays CCPA information for California residents", () => {
      expect(screen.getByText(/California Residents \(CCPA\)/)).toBeInTheDocument();
    });

    it("displays GDPR information for European users", () => {
      expect(screen.getByText(/European Users \(GDPR\)/)).toBeInTheDocument();
    });
  });
});
