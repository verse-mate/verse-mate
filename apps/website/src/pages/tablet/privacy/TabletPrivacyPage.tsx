/**
 * Tablet Privacy Policy Page
 */

import React from "react";
import Header from "@/sections/tablet/Header";
import Footer from "@/sections/tablet/Footer";
import Link from "next/link";

export default function TabletPrivacyPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "0px",
        position: "relative",
        width: "1024px",
        background: "#FFFFFF",
      }}
      data-testid="tablet-privacy-page"
    >
      <Header />

      {/* Hero Section */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "96px 64px",
          gap: "32px",
          width: "1024px",
          minHeight: "250px",
          background: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/give.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          style={{
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            padding: "8px 0px",
            gap: "8px",
            borderBottom: "6px solid #C2B291",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 600,
              fontSize: "24px",
              lineHeight: "32px",
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              margin: 0,
            }}
          >
            PRIVACY POLICY
          </h1>
        </div>
        <p
          style={{
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 300,
            fontSize: "16px",
            lineHeight: "24px",
            color: "#FFFFFF",
            textAlign: "center",
            margin: 0,
          }}
        >
          Effective Date: December 23, 2025 | Last Updated: December 23, 2025
        </p>
      </section>

      {/* Content Section */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "96px 64px",
          gap: "48px",
          width: "1024px",
          background: "#FFFFFF",
        }}
      >
        <div
          style={{
            width: "896px",
            display: "flex",
            flexDirection: "column",
            gap: "48px",
          }}
        >
          {/* Introduction */}
          <div>
            <p
              style={{
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#000000",
                margin: 0,
              }}
            >
              VerseMate ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Service").
            </p>
            <p
              style={{
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#000000",
                margin: "16px 0 0 0",
              }}
            >
              VerseMate is operated by VerseMate, a 501(c)(3) nonprofit organization. By using our Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </div>

          {/* Information We Collect */}
          <div>
            <h2
              style={{
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "24px",
                lineHeight: "32px",
                color: "#000000",
                margin: "0 0 8px 0",
              }}
            >
              Information We Collect
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <h3
              style={{
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "18px",
                lineHeight: "28px",
                color: "#000000",
                margin: "0 0 16px 0",
              }}
            >
              Information You Provide
            </h3>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              Account Information
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0", paddingLeft: "24px" }}>
              <li>Email address (when you create an account)</li>
              <li>Display name (optional)</li>
              <li>Authentication credentials (securely hashed, never stored in plain text)</li>
            </ul>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              User-Generated Content
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 24px 0", paddingLeft: "24px" }}>
              <li>Bookmarks you create</li>
              <li>Highlights you make in Scripture</li>
              <li>Personal notes and reflections</li>
              <li>Reading preferences and settings</li>
            </ul>

            <h3 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "18px", lineHeight: "28px", color: "#000000", margin: "0 0 16px 0" }}>
              Information Collected Automatically
            </h3>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              Usage Data
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0", paddingLeft: "24px" }}>
              <li>Pages and features you interact with</li>
              <li>Reading history and progress</li>
              <li>App performance data (load times, errors)</li>
              <li>Session duration and frequency</li>
            </ul>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              Device Information
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0", paddingLeft: "24px" }}>
              <li>Device type and operating system</li>
              <li>App version</li>
              <li>Language and region settings</li>
              <li>Unique device identifiers (anonymized)</li>
            </ul>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              Analytics Data
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              We use PostHog, a privacy-focused analytics platform, to understand how our Service is used and to improve your experience. PostHog collects:
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0", paddingLeft: "24px" }}>
              <li>Feature usage patterns</li>
              <li>Navigation flows</li>
              <li>Error reports and crash data</li>
              <li>Performance metrics</li>
            </ul>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              PostHog data is used solely for product improvement and is not sold to third parties.
            </p>
          </div>

          {/* How We Use Your Information */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              How We Use Your Information
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              We use your information to:
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 24px 0", paddingLeft: "24px" }}>
              <li><strong>Provide the Service:</strong> Enable you to read Scripture, save bookmarks, create highlights and notes, and access your account across devices</li>
              <li><strong>Improve the Service:</strong> Analyze usage patterns to enhance features, fix bugs, and optimize performance</li>
              <li><strong>Personalize Your Experience:</strong> Remember your preferences, reading history, and saved content</li>
              <li><strong>Communicate With You:</strong> Send important updates about the Service (you can opt out of non-essential communications)</li>
              <li><strong>Ensure Security:</strong> Protect against unauthorized access, fraud, and abuse</li>
            </ul>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              We do <strong>not</strong> use your information to:
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0", paddingLeft: "24px" }}>
              <li>Sell your data to third parties</li>
              <li>Display targeted advertisements</li>
              <li>Create advertising profiles</li>
              <li>Share your data with marketing partners</li>
            </ul>
          </div>

          {/* Data Sharing */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Data Sharing
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              We share your information only in the following limited circumstances:
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              Service Providers
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              We work with trusted third-party services to operate VerseMate:
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0", paddingLeft: "24px" }}>
              <li><strong>Hosting & Infrastructure:</strong> Cloud servers to store your data securely</li>
              <li><strong>Analytics:</strong> PostHog for product analytics (privacy-focused, no data selling)</li>
              <li><strong>Authentication:</strong> Secure login services</li>
            </ul>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              All service providers are contractually required to protect your data and use it only for the purposes we specify.
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              Legal Requirements
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              We may disclose your information if required by law or in response to valid legal requests (e.g., court orders, subpoenas).
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              With Your Consent
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              We may share your information in other circumstances if you give us explicit consent.
            </p>
          </div>

          {/* Data Retention */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Data Retention
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 24px 0" }}>
              We retain your information for as long as necessary to provide the Service:
            </p>

            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-inter)", fontSize: "16px", lineHeight: "24px", marginBottom: "24px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px", background: "#F5F5F5", border: "1px solid #E0E0E0", fontWeight: 600 }}>Data Type</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", background: "#F5F5F5", border: "1px solid #E0E0E0", fontWeight: 600 }}>Retention Period</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Account information</td>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Until you delete your account</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Bookmarks, highlights, notes</td>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Until you delete them or your account</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Reading history</td>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Until you delete your account</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Analytics data</td>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>12 months, then anonymized</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>Error/crash logs</td>
                  <td style={{ padding: "12px 16px", border: "1px solid #E0E0E0", fontWeight: 300 }}>90 days</td>
                </tr>
              </tbody>
            </table>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              When you delete your account, we remove your personal data within 30 days, except where retention is required by law or for legitimate business purposes (e.g., fraud prevention).
            </p>
          </div>

          {/* Your Rights & Choices */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Your Rights & Choices
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              You have the following rights regarding your data:
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>Access & Portability</p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              You can view your personal data within the app settings. Contact us at <a href="mailto:versematehelp@gmail.com" style={{ color: "#C2B291" }}>versematehelp@gmail.com</a> to request a copy of your data.
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>Correction</p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              You can update your account information and preferences at any time within the app.
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>Deletion</p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              You can delete individual bookmarks, highlights, and notes at any time. To delete your entire account and all associated data, contact us at <a href="mailto:versematehelp@gmail.com" style={{ color: "#C2B291" }}>versematehelp@gmail.com</a>.
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>Opt-Out of Analytics</p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              You can opt out of analytics tracking in the app settings. This will stop the collection of usage data while still allowing the app to function.
            </p>

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>Do Not Sell My Personal Information</p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 24px 0" }}>
              We do not sell your personal information. Ever.
            </p>

            <h3 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "18px", lineHeight: "28px", color: "#000000", margin: "0 0 8px 0" }}>For California Residents (CCPA)</h3>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              California residents have additional rights under the California Consumer Privacy Act, including the right to know what personal information is collected, request deletion, and opt out of sale (though we do not sell data).
            </p>

            <h3 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "18px", lineHeight: "28px", color: "#000000", margin: "0 0 8px 0" }}>For European Users (GDPR)</h3>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              If you are in the European Economic Area, you have rights under the General Data Protection Regulation, including access, rectification, erasure, restriction, portability, and objection. Contact us at <a href="mailto:versematehelp@gmail.com" style={{ color: "#C2B291" }}>versematehelp@gmail.com</a> to exercise these rights.
            </p>
          </div>

          {/* Data Security */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Data Security
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              We implement industry-standard security measures to protect your data:
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0", paddingLeft: "24px" }}>
              <li><strong>Encryption:</strong> Data is encrypted in transit (TLS/HTTPS) and at rest</li>
              <li><strong>Secure Authentication:</strong> Passwords are hashed using modern algorithms</li>
              <li><strong>Access Controls:</strong> Only authorized personnel can access user data</li>
              <li><strong>Regular Audits:</strong> We regularly review our security practices</li>
            </ul>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              While we strive to protect your information, no method of transmission or storage is 100% secure. If you discover a security vulnerability, please contact us at <a href="mailto:versematehelp@gmail.com" style={{ color: "#C2B291" }}>versematehelp@gmail.com</a>.
            </p>
          </div>

          {/* Children's Privacy */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Children's Privacy
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              VerseMate is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us at <a href="mailto:versematehelp@gmail.com" style={{ color: "#C2B291" }}>versematehelp@gmail.com</a>, and we will delete such information.
            </p>
          </div>

          {/* Third-Party Links */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Third-Party Links
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any personal information.
            </p>
          </div>

          {/* Changes to This Policy */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Changes to This Policy
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              We may update this Privacy Policy from time to time. We will notify you of any material changes by:
            </p>
            <ul style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0", paddingLeft: "24px" }}>
              <li>Posting the updated policy within the app</li>
              <li>Updating the "Last Updated" date at the top of this page</li>
              <li>Sending an email notification for significant changes (if you have an account)</li>
            </ul>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              Your continued use of the Service after changes become effective constitutes acceptance of the updated policy.
            </p>
          </div>

          {/* Contact Us */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              Contact Us
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              If you have questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 8px 0" }}>
              <strong>Email:</strong> <a href="mailto:versematehelp@gmail.com" style={{ color: "#C2B291" }}>versematehelp@gmail.com</a>
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              <strong>Support:</strong> <Link href="/support" style={{ color: "#C2B291" }}>https://versemate.org/support</Link>
            </p>
          </div>

          {/* About VerseMate */}
          <div>
            <h2 style={{ fontFamily: "var(--font-inter)", fontWeight: 600, fontSize: "24px", lineHeight: "32px", color: "#000000", margin: "0 0 8px 0" }}>
              About VerseMate
            </h2>
            <div style={{ width: "64px", height: "4px", background: "#C2B291", marginBottom: "24px" }} />

            <p style={{ fontFamily: "var(--font-inter)", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0 0 16px 0" }}>
              VerseMate is a 501(c)(3) nonprofit organization dedicated to making the Bible easier to understand for everyone, everywhere.
            </p>
            <p style={{ fontFamily: "var(--font-inter)", fontStyle: "italic", fontWeight: 300, fontSize: "16px", lineHeight: "24px", color: "#000000", margin: "0" }}>
              "The Bible Was Meant to Be Understood - Not Just Read."
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
