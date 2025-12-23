/**
 * Support Page Tests
 *
 * These tests verify the Support page functionality:
 * - Route renders without errors
 * - Page contains "Contact Support" heading
 * - mailto link to versematehelp@gmail.com is present
 * - Page follows expected styling patterns
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
import Support from "../pages/support";
import DesktopSupportPage from "../pages/desktop/support/DesktopSupportPage";

describe("Support Page", () => {
  describe("Route Rendering", () => {
    it("renders the support page without errors", () => {
      expect(() => render(<Support />)).not.toThrow();
    });

    it("renders the desktop support page variant without errors", () => {
      expect(() => render(<DesktopSupportPage />)).not.toThrow();
    });
  });

  describe("Content", () => {
    beforeEach(() => {
      render(<DesktopSupportPage />);
    });

    it("displays the Contact Support heading", () => {
      expect(screen.getByText("CONTACT SUPPORT")).toBeInTheDocument();
    });

    it("displays Get in Touch section", () => {
      expect(screen.getByText("Get in Touch")).toBeInTheDocument();
    });

    it("displays Email Us section", () => {
      expect(screen.getByText("Email Us")).toBeInTheDocument();
    });

    it("displays What to Include section", () => {
      expect(screen.getByText("What to Include in Your Message")).toBeInTheDocument();
    });

    it("displays help information", () => {
      expect(
        screen.getByText(/We're here to help/)
      ).toBeInTheDocument();
    });
  });

  describe("Links", () => {
    beforeEach(() => {
      render(<DesktopSupportPage />);
    });

    it("contains mailto link to versematehelp@gmail.com", () => {
      const mailtoLinks = screen.getAllByRole("link", { name: /info@versemate\.org/ });
      expect(mailtoLinks.length).toBeGreaterThan(0);

      const emailLink = mailtoLinks.find(
        (link) => link.getAttribute("href") === "mailto:versematehelp@gmail.com"
      );
      expect(emailLink).toBeInTheDocument();
    });

    it("contains internal link to Privacy Policy", () => {
      // There may be multiple Privacy Policy links (page content + footer)
      const privacyLinks = screen.getAllByRole("link", { name: /Privacy Policy/ });
      expect(privacyLinks.length).toBeGreaterThan(0);

      // Verify at least one link points to /privacy
      const validLink = privacyLinks.find(
        (link) => link.getAttribute("href") === "/privacy"
      );
      expect(validLink).toBeInTheDocument();
    });
  });

  describe("About Section", () => {
    beforeEach(() => {
      render(<DesktopSupportPage />);
    });

    it("displays nonprofit organization info", () => {
      expect(
        screen.getByText(/501\(c\)\(3\) nonprofit organization/)
      ).toBeInTheDocument();
    });

    it("displays VerseMate tagline", () => {
      expect(
        screen.getByText(/The Bible Was Meant to Be Understood/)
      ).toBeInTheDocument();
    });
  });
});
