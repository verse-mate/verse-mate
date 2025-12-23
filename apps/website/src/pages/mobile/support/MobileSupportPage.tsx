"use client";

/**
 * Mobile Support Page
 */

import React from "react";
import MobileHeader from "@/sections/mobile/MobileHeader";
import MobileFooter from "@/sections/mobile/MobileFooter";
import Link from "next/link";

export default function MobileSupportPage() {
  return (
    <>
      <MobileHeader />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "76px 0px 0px",
          position: "relative",
          width: "100vw",
          maxWidth: "440px",
          minHeight: "100vh",
          background: "#FFFFFF",
          margin: "0 auto",
        }}
        data-testid="mobile-support-page"
      >
        {/* Hero Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            gap: "24px",
            width: "100%",
            minHeight: "200px",
            background: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url(/give.png)",
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
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "16px",
                lineHeight: "24px",
                textAlign: "center",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#FFFFFF",
                margin: 0,
              }}
            >
              CONTACT SUPPORT
            </h1>
          </div>
          <p
            style={{
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 200,
              fontSize: "14px",
              lineHeight: "20px",
              color: "#FFFFFF",
              textAlign: "center",
              margin: 0,
            }}
          >
            We're here to help! If you have any questions, feedback, or need assistance with VerseMate, please reach out.
          </p>
        </div>

        {/* Content Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "48px 24px",
            gap: "32px",
            width: "100%",
            background: "#FFFFFF",
          }}
        >
          {/* Contact Section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "24px",
              width: "100%",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <h2
                style={{
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "20px",
                  lineHeight: "24px",
                  color: "#000000",
                  margin: "0 0 8px 0",
                }}
              >
                Get in Touch
              </h2>
              <div style={{ width: "48px", height: "4px", background: "#C2B291", margin: "0 auto 16px auto" }} />
              <p
                style={{
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 200,
                  fontSize: "14px",
                  lineHeight: "22px",
                  color: "#000000",
                  margin: 0,
                }}
              >
                Whether you're experiencing technical issues, have questions about the app, or simply want to share feedback, our team is happy to assist you.
              </p>
            </div>

            {/* Email Contact Card */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "32px 24px",
                gap: "20px",
                background: "#F9F9F9",
                borderRadius: "8px",
                width: "100%",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#C2B291",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 6L12 13L2 6" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 600,
                    fontSize: "16px",
                    lineHeight: "24px",
                    color: "#000000",
                    margin: "0 0 8px 0",
                  }}
                >
                  Email Us
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 200,
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#666666",
                    margin: "0 0 20px 0",
                  }}
                >
                  Send us an email and we'll get back to you as soon as possible.
                </p>
                <a
                  href="mailto:info@versemate.org"
                  style={{
                    display: "inline-flex",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "14px 28px",
                    gap: "8px",
                    background: "#C2B291",
                    borderRadius: "100px",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                      fontStyle: "normal",
                      fontWeight: 600,
                      fontSize: "14px",
                      lineHeight: "22px",
                      color: "#000000",
                    }}
                  >
                    info@versemate.org
                  </span>
                </a>
              </div>
            </div>
          </div>

          {/* Additional Info Section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              width: "100%",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 700,
                fontSize: "20px",
                lineHeight: "24px",
                color: "#000000",
                margin: 0,
              }}
            >
              What to Include
            </h2>
            <div style={{ width: "48px", height: "4px", background: "#C2B291" }} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                textAlign: "left",
                width: "100%",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 200,
                  fontSize: "14px",
                  lineHeight: "22px",
                  color: "#000000",
                  margin: 0,
                }}
              >
                To help us assist you better, please include:
              </p>
              <ul
                style={{
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 200,
                  fontSize: "14px",
                  lineHeight: "22px",
                  color: "#000000",
                  margin: 0,
                  paddingLeft: "20px",
                }}
              >
                <li>A description of the issue or question</li>
                <li>The device you're using</li>
                <li>The app version (found in Settings)</li>
                <li>Any error messages you've seen</li>
                <li>Steps to reproduce the issue</li>
              </ul>
            </div>
          </div>

          {/* Privacy Link */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              textAlign: "center",
              paddingTop: "24px",
              borderTop: "1px solid #E0E0E0",
              width: "100%",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 200,
                fontSize: "13px",
                lineHeight: "20px",
                color: "#666666",
                margin: 0,
              }}
            >
              For information about how we handle your data, please see our{" "}
              <Link href="/privacy" style={{ color: "#C2B291" }}>
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {/* About VerseMate */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 200,
                fontSize: "13px",
                lineHeight: "20px",
                color: "#666666",
                margin: 0,
              }}
            >
              VerseMate is a 501(c)(3) nonprofit organization dedicated to making the Bible easier to understand for everyone, everywhere.
            </p>
            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "italic",
                fontWeight: 200,
                fontSize: "13px",
                lineHeight: "20px",
                color: "#666666",
                margin: 0,
              }}
            >
              "The Bible Was Meant to Be Understood - Not Just Read."
            </p>
          </div>
        </div>
      </div>
      <MobileFooter />
    </>
  );
}
