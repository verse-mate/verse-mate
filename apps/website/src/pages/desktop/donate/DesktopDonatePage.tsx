/**
 * Desktop Donate Landing Page with Form
 */

import React, { useState } from "react";
import Header from "@/sections/desktop/Header";
import Footer from "@/sections/desktop/Footer";

export default function DesktopDonatePage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    message: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Create email body with form data
    const emailBody = `Hi VerseMate Team,

I'm interested in making a donation to support VerseMate! Here are my details:

First Name: ${formData.firstName}
Last Name: ${formData.lastName}
Email: ${formData.email}

Additional Information:
${formData.message || 'No additional information provided.'}

Thank you for the opportunity to support your mission!

Best regards,
${formData.firstName} ${formData.lastName}`;

    // Create mailto URL with subject and body
    const subject = encodeURIComponent('Donation Inquiry - ' + formData.firstName + ' ' + formData.lastName);
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:info@versemate.org?subject=${subject}&body=${body}`;

    // Open email client
    window.location.href = mailtoUrl;
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Support VerseMate Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "96px 120px",
          gap: "64px",
          width: "100vw",
          height: "736px",
          background: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/give.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "0px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0
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
            width: "307px",
            height: "48px",
            borderBottom: "6px solid #C2B291",
            flex: "none",
            order: 0,
            flexGrow: 0
          }}
        >
          <div
            style={{
              width: "327px",
              height: "32px",
              fontFamily: "Inter",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "24px",
              lineHeight: "32px",
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              flexGrow: 0
            }}
          >
            SUPPORT VERSEMATE
          </div>
        </div>

        {/* Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "1200px",
            height: "432px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0
          }}
        >
          {/* Hero text */}
          <div
            style={{
              width: "1200px",
              height: "64px",
              fontFamily: "Merriweather",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "48px",
              lineHeight: "64px",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0
            }}
          >
            Help People Everywhere Engage with God's Word
          </div>

          {/* Description text */}
          <div
            style={{
              width: "1200px",
              height: "352px",
              fontFamily: "Inter",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "24px",
              lineHeight: "32px",
              color: "#FFFFFF",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
              display: "flex",
              flexDirection: "column",
              gap: "16px"
            }}
          >
            <p style={{ margin: 0 }}>
              Your generosity helps us create resources and tools that make Scripture clear and accessible to people worldwide. Every gift you give makes a direct impact—whether it's supporting the translation of content, improving our technology, or helping us reach new communities with the truth of God's Word.
            </p>
            <p style={{ margin: 0 }}>
              Through your partnership, VerseMate can continue developing simple, powerful tools that guide people not only to read the Bible, but to truly understand and apply it in their daily lives. We believe that when people engage Scripture with clarity, transformation follows—families are encouraged, faith grows stronger, and entire communities can be renewed.
            </p>
            <p style={{ margin: 0 }}>
              Thank you for prayerfully considering a gift to VerseMate. Together, we can equip more people across languages and cultures to connect with God's Word in a deeper way.
            </p>
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "96px 120px",
          gap: "64px",
          width: "100vw",
          minHeight: "912px",
          background: "#FFFFFF",
          flex: "none",
          order: 2,
          alignSelf: "stretch",
          flexGrow: 0
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "40px",
            width: "600px",
            height: "720px",
            flex: "none",
            order: 0,
            flexGrow: 0
          }}
        >
          {/* Form Header */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px",
              gap: "16px",
              width: "600px",
              height: "120px",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0
            }}
          >
            <h2
              style={{
                width: "402px",
                height: "32px",
                fontFamily: "Inter",
                fontStyle: "normal",
                fontWeight: 700,
                fontSize: "24px",
                lineHeight: "32px",
                color: "#000000",
                flex: "none",
                order: 0,
                flexGrow: 0,
                margin: 0
              }}
            >
              Connect With Us About Donations
            </h2>
            <p
              style={{
                width: "640px",
                height: "72px",
                fontFamily: "Inter",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#000000",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
                margin: 0
              }}
            >
              We'd love to hear from you! If you're interested in supporting VerseMate with a{" "}
              <br />
              donation, please fill out the form below. One of our team members will connect{" "}
              <br />
              with you soon to guide you through the next steps.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "0px",
              gap: "24px",
              width: "600px",
              height: "560px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0
            }}
          >
            {/* First Name Input */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "600px",
                height: "76px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "81px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0
                }}
              >
                <span
                  style={{
                    width: "73px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0
                  }}
                >
                  First Name
                </span>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                    flexGrow: 0
                  }}
                >
                  *
                </span>
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                required
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  padding: "16px",
                  fontFamily: "Inter",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0
                }}
              />
            </div>

            {/* Last Name Input */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "600px",
                height: "76px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "80px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0
                }}
              >
                <span
                  style={{
                    width: "72px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0
                  }}
                >
                  Last Name
                </span>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                    flexGrow: 0
                  }}
                >
                  *
                </span>
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                required
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  padding: "16px",
                  fontFamily: "Inter",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0
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
                width: "600px",
                height: "76px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "44px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0
                }}
              >
                <span
                  style={{
                    width: "36px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0
                  }}
                >
                  Email
                </span>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                    flexGrow: 0
                  }}
                >
                  *
                </span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  padding: "16px",
                  fontFamily: "Inter",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0
                }}
              />
            </div>

            {/* Message Input */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "4px",
                width: "600px",
                height: "140px",
                flex: "none",
                order: 3,
                alignSelf: "stretch",
                flexGrow: 0
              }}
            >
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  padding: "0px",
                  width: "211px",
                  height: "16px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0
                }}
              >
                <span
                  style={{
                    width: "231px",
                    height: "16px",
                    fontFamily: "Inter",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                    flexGrow: 0
                  }}
                >
                  Anything You'd Like Us to Know
                </span>
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "120px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  padding: "16px",
                  fontFamily: "Inter",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 1,
                  resize: "none"
                }}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                padding: "24px 48px",
                gap: "8px",
                width: "288px",
                height: "80px",
                background: "#C2B291",
                borderRadius: "100px",
                border: "none",
                cursor: "pointer",
                flex: "none",
                order: 4,
                flexGrow: 0,
                alignSelf: "center"
              }}
            >
              <span
                style={{
                  width: "69px",
                  height: "32px",
                  fontFamily: "Inter",
                  fontStyle: "normal",
                  fontWeight: 600,
                  fontSize: "20px",
                  lineHeight: "32px",
                  color: "#000000",
                  flex: "none",
                  order: 0,
                  flexGrow: 0
                }}
              >
                Submit
              </span>
            </button>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
}