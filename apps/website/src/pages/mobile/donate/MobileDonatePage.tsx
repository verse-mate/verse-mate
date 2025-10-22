"use client";

import React, { useState } from "react";
import MobileHeader from "@/sections/mobile/MobileHeader";
import MobileFooter from "@/sections/mobile/MobileFooter";

export default function MobileDonatePage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    const subject = "I want to make a donation";
    const body = `Hi,\n\nI'm interested in supporting VerseMate with a donation.\n\nName: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.phone}\nMessage: ${formData.message}\n\nPlease reach out to discuss donation options.\n\nThank you!`;

    const mailtoUrl = `mailto:info@versemate.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

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
      >
        {/* Why Versemate */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "48px 24px",
          gap: "48px",
          width: "100%",
          background: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url(/give.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "0px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Title */}
        <div
          style={{
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            padding: "8px 0px",
            gap: "8px",
            width: "205px",
            height: "40px",
            borderBottom: "6px solid #C2B291",
            flex: "none",
            order: 0,
            flexGrow: 0,
          }}
        >
          <span
            style={{
              width: "225px",
              height: "24px",
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 600,
              fontSize: "16px",
              lineHeight: "24px",
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              flexGrow: 0,
            }}
          >
            SUPPORT VERSEMATE
          </span>
        </div>

        {/* Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "392px",
            height: "616px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          <h1
            style={{
              width: "392px",
              height: "120px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 600,
              fontSize: "32px",
              lineHeight: "40px",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Help People Everywhere Engage with God's Word
          </h1>

          <p
            style={{
              width: "392px",
              height: "480px",
              fontFamily: "Inter",
              fontStyle: "normal",
              fontWeight: 200,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#FFFFFF",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Your generosity helps us create resources and tools that make Scripture clear and accessible to people worldwide. Every gift you give makes a direct impact—whether it's supporting the translation of content, improving our technology, or helping us reach new communities with the truth of God's Word.
            <br /><br />
            Through your partnership, VerseMate can continue developing simple, powerful tools that guide people not only to read the Bible, but to truly understand and apply it in their daily lives. We believe that when people engage Scripture with clarity, transformation follows—families are encouraged, faith grows stronger, and entire communities can be renewed.
            <br /><br />
            Thank you for prayerfully considering a gift to VerseMate. Together, we can equip more people across languages and cultures to connect with God's Word in a deeper way.
          </p>
        </div>
      </div>

      {/* Form Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "48px 24px",
          gap: "48px",
          width: "100%",
          background: "#FFFFFF",
          flex: "none",
          order: 2,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Form */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "40px",
            width: "392px",
            height: "760px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Form Header Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px",
              gap: "16px",
              width: "392px",
              height: "160px",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            <h2
              style={{
                width: "392px",
                height: "24px",
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 700,
                fontSize: "20px",
                lineHeight: "24px",
                color: "#000000",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
                margin: "0",
                textAlign: "left",
              }}
            >
              Connect With Us About Donations
            </h2>

            <p
              style={{
                width: "392px",
                height: "120px",
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 200,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#000000",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
                margin: "0",
                textAlign: "left",
              }}
            >
              We'd love to hear from you! If you're interested in supporting VerseMate with a donation, please fill out the form below. One of our team members will connect with you soon to guide you through the next steps.
            </p>
          </div>

          {/* Form Inputs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "0px",
              gap: "24px",
              width: "392px",
              height: "440px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          >
            {/* Name Input */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "392px",
                height: "76px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "81px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              >
                <label
                  style={{
                    width: "73px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  First Name
                </label>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                    flexGrow: 0,
                  }}
                >
                  *
                </span>
              </div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                style={{
                  boxSizing: "border-box",
                  width: "392px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  padding: "16px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                }}
              />
            </div>

            {/* Email Input */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "392px",
                height: "76px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "80px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              >
                <label
                  style={{
                    width: "72px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Last Name
                </label>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                    flexGrow: 0,
                  }}
                >
                  *
                </span>
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                style={{
                  boxSizing: "border-box",
                  width: "392px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  padding: "16px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                }}
              />
            </div>

            {/* Phone Input */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "392px",
                height: "76px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "44px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              >
                <label
                  style={{
                    width: "36px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Email
                </label>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                    flexGrow: 0,
                  }}
                >
                  *
                </span>
              </div>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                style={{
                  boxSizing: "border-box",
                  width: "392px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  padding: "16px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                }}
              />
            </div>

            {/* Message Textarea */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "392px",
                height: "140px",
                flex: "none",
                order: 3,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "211px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              >
                <label
                  style={{
                    width: "231px",
                    height: "16px",
                    fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0,
                  }}
                >
                  Anything You'd Like Us to Know
                </label>
              </div>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                style={{
                  boxSizing: "border-box",
                  width: "392px",
                  height: "120px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 1,
                  padding: "16px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                  resize: "none",
                }}
                placeholder="Share any specific areas you'd like to support or questions about donations..."
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              padding: "24px 48px",
              gap: "8px",
              width: "392px",
              height: "80px",
              background: "#C2B291",
              borderRadius: "100px",
              flex: "none",
              order: 2,
              alignSelf: "stretch",
              flexGrow: 0,
              border: "none",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: "69px",
                height: "32px",
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "20px",
                lineHeight: "32px",
                color: "#000000",
                flex: "none",
                order: 0,
                flexGrow: 0,
              }}
            >
              Submit
            </span>
          </button>
        </div>
      </div>

      </div>
      <MobileFooter />
    </>
  );
}