/**
 * Tablet Donate Landing Page with Form
 */

import React, { useState } from "react";

export default function TabletDonatePage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Create email body with form data
    const emailBody = `Hi VerseMate Team,

I'm interested in making a donation to support VerseMate! Here are my details:

First Name: ${formData.firstName}
Last Name: ${formData.lastName}
Email: ${formData.email}

Additional Information:
${formData.message || "No additional information provided."}

Thank you for the opportunity to support your mission!

Best regards,
${formData.firstName} ${formData.lastName}`;

    // Create mailto URL with subject and body
    const subject = encodeURIComponent(
      "Donation Inquiry - " + formData.firstName + " " + formData.lastName
    );
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:info@versemate.org?subject=${subject}&body=${body}`;

    // Open email client
    window.location.href = mailtoUrl;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

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
      data-testid="tablet-donate-page"
    >
      {/* Why Versemate Section */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "96px 64px",
          gap: "64px",
          width: "1024px",
          height: "896px",
          background:
            "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/give.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "0px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
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
          }}
        >
          <h2
            style={{
              width: "327px",
              height: "32px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 600,
              fontSize: "24px",
              lineHeight: "32px",
              textAlign: "center",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              margin: 0,
            }}
          >
            SUPPORT VERSEMATE
          </h2>
        </div>

        {/* Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "896px",
            height: "592px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
          }}
        >
          <h1
            style={{
              width: "896px",
              height: "128px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 600,
              fontSize: "48px",
              lineHeight: "64px",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              margin: 0,
            }}
          >
            Help People Everywhere Engage with God's Word
          </h1>
          <p
            style={{
              width: "896px",
              height: "448px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "24px",
              lineHeight: "32px",
              color: "#FFFFFF",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              margin: 0,
            }}
          >
            Your generosity helps us create resources and tools that make
            Scripture clear and accessible to people worldwide. Every gift you
            give makes a direct impact—whether it's supporting the translation
            of content, improving our technology, or helping us reach new
            communities with the truth of God's Word.
            <br />
            <br />
            Through your partnership, VerseMate can continue developing simple,
            powerful tools that guide people not only to read the Bible, but to
            truly understand and apply it in their daily lives. We believe that
            when people engage Scripture with clarity, transformation
            follows—families are encouraged, faith grows stronger, and entire
            communities can be renewed.
            <br />
            <br />
            Thank you for prayerfully considering a gift to VerseMate. Together,
            we can equip more people across languages and cultures to connect
            with God's Word in a deeper way.
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "96px 64px",
          gap: "64px",
          width: "1024px",
          height: "912px",
          background: "#FFFFFF",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
        }}
      >
        <form
          onSubmit={handleSubmit}
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
            }}
          >
            <h2
              style={{
                width: "402px",
                height: "32px",
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "24px",
                lineHeight: "32px",
                color: "#000000",
                flex: "none",
                order: 0,
                margin: 0,
              }}
            >
              Connect With Us About Donations
            </h2>
            <p
              style={{
                width: "600px",
                height: "72px",
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#000000",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                margin: 0,
              }}
            >
              We'd love to hear from you! If you're interested in supporting
              VerseMate with a donation, please fill out the form below. One of
              our team members will connect with you soon to guide you through
              the next steps.
            </p>
          </div>

          {/* Inputs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "0px",
              gap: "24px",
              width: "600px",
              height: "440px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
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
                }}
              >
                <label
                  htmlFor="firstName"
                  style={{
                    width: "73px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                  }}
                >
                  First Name
                </label>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                  }}
                >
                  *
                </span>
              </div>
              <input
                type="text"
                id="firstName"
                name="firstName"
                required
                value={formData.firstName}
                onChange={handleChange}
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  padding: "16px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                }}
                placeholder="Enter your first name"
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
                }}
              >
                <label
                  htmlFor="lastName"
                  style={{
                    width: "72px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                  }}
                >
                  Last Name
                </label>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                  }}
                >
                  *
                </span>
              </div>
              <input
                type="text"
                id="lastName"
                name="lastName"
                required
                value={formData.lastName}
                onChange={handleChange}
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  padding: "16px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                }}
                placeholder="Enter your last name"
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
                }}
              >
                <label
                  htmlFor="email"
                  style={{
                    width: "36px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                  }}
                >
                  Email
                </label>
                <span
                  style={{
                    width: "8px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#B03A42",
                    flex: "none",
                    order: 1,
                  }}
                >
                  *
                </span>
              </div>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "56px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  padding: "16px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#000000",
                }}
                placeholder="Enter your email"
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
                width: "600px",
                height: "140px",
                flex: "none",
                order: 3,
                alignSelf: "stretch",
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
                }}
              >
                <label
                  htmlFor="message"
                  style={{
                    width: "231px",
                    height: "16px",
                    fontFamily: "var(--font-inter)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "16px",
                    color: "#818991",
                    flex: "none",
                    order: 0,
                  }}
                >
                  Anything You'd Like Us to Know
                </label>
              </div>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                style={{
                  boxSizing: "border-box",
                  width: "600px",
                  height: "120px",
                  background: "#FFFFFF",
                  border: "1px solid #DCE0E3",
                  borderRadius: "5px",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 1,
                  padding: "16px",
                  fontFamily: "var(--font-inter)",
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
              flex: "none",
              order: 2,
              border: "none",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: "69px",
                height: "32px",
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "20px",
                lineHeight: "32px",
                color: "#000000",
                flex: "none",
                order: 0,
              }}
            >
              Submit
            </span>
          </button>
        </form>
      </section>
    </div>
  );
}
