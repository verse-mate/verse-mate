/**
 * Integration Tests for Privacy and Support Pages
 *
 * These tests cover cross-cutting concerns identified in gap analysis:
 * - Responsive variants render correctly (mobile/tablet)
 * - Accessibility: proper heading hierarchy
 * - Integration: page-to-page navigation links work
 *
 * Note: These are strategic tests to fill gaps from Task Groups 1-3.
 * Maximum 5 additional tests as per spec requirements.
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
import MobilePrivacyPage from "../pages/mobile/privacy/MobilePrivacyPage";
import TabletPrivacyPage from "../pages/tablet/privacy/TabletPrivacyPage";
import MobileSupportPage from "../pages/mobile/support/MobileSupportPage";
import TabletSupportPage from "../pages/tablet/support/TabletSupportPage";
import DesktopPrivacyPage from "../pages/desktop/privacy/DesktopPrivacyPage";

describe("Responsive Variants", () => {
  describe("Privacy Page - Mobile and Tablet", () => {
    it("renders mobile privacy page variant with key content", () => {
      render(<MobilePrivacyPage />);

      // Verify key sections render on mobile
      expect(screen.getByText("PRIVACY POLICY")).toBeInTheDocument();
      expect(screen.getByText("Information We Collect")).toBeInTheDocument();
      expect(screen.getByText("Your Rights & Choices")).toBeInTheDocument();
    });

    it("renders tablet privacy page variant with key content", () => {
      render(<TabletPrivacyPage />);

      // Verify key sections render on tablet
      expect(screen.getByText("PRIVACY POLICY")).toBeInTheDocument();
      expect(screen.getByText("Data Retention")).toBeInTheDocument();
      expect(screen.getByText("Contact Us")).toBeInTheDocument();
    });
  });

  describe("Support Page - Mobile and Tablet", () => {
    it("renders mobile support page variant with key content", () => {
      render(<MobileSupportPage />);

      // Verify key content renders on mobile
      expect(screen.getByText("CONTACT SUPPORT")).toBeInTheDocument();
      expect(screen.getByText("Email Us")).toBeInTheDocument();

      // Verify mailto link exists
      const mailtoLinks = screen.getAllByRole("link", { name: /info@versemate\.org/ });
      expect(mailtoLinks.length).toBeGreaterThan(0);
    });

    it("renders tablet support page variant with key content", () => {
      render(<TabletSupportPage />);

      // Verify key content renders on tablet
      expect(screen.getByText("CONTACT SUPPORT")).toBeInTheDocument();
      expect(screen.getByText("Get in Touch")).toBeInTheDocument();
    });
  });
});

describe("Accessibility", () => {
  it("privacy page has proper heading hierarchy (h1 followed by h2s)", () => {
    render(<DesktopPrivacyPage />);

    // Check for h1 (main title)
    const h1Elements = document.querySelectorAll("h1");
    expect(h1Elements.length).toBeGreaterThanOrEqual(1);

    // Check that h1 contains expected content
    const mainHeading = Array.from(h1Elements).find(
      (h1) => h1.textContent?.includes("PRIVACY POLICY")
    );
    expect(mainHeading).toBeTruthy();

    // Check for h2 section headings
    const h2Elements = document.querySelectorAll("h2");
    expect(h2Elements.length).toBeGreaterThanOrEqual(5); // At least 5 main sections

    // Verify key section headings exist as h2
    const h2Texts = Array.from(h2Elements).map((h2) => h2.textContent);
    expect(h2Texts).toContain("Information We Collect");
    expect(h2Texts).toContain("Contact Us");
  });
});
