/**
 * Tablet Volunteer Landing Page with Form
 */

import React, { useState } from "react";

export default function TabletVolunteerPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
    // Handle form submission logic here
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
      data-testid="tablet-volunteer-page"
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
          height: "800px",
          background:
            "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/ServeWithVersemate.png')",
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
            width: "348px",
            height: "48px",
            borderBottom: "6px solid #C2B291",
            flex: "none",
            order: 0,
          }}
        >
          <h2
            style={{
              width: "368px",
              height: "32px",
              fontFamily: "var(--font-inter)",
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
              margin: 0,
            }}
          >
            SERVE WITH VERSEMATE
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
            height: "496px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
          }}
        >
          <h1
            style={{
              width: "896px",
              height: "192px",
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
            Versemate exists to help people everywhere truly understand God's
            Word - not just read it.
          </h1>
          <p
            style={{
              width: "896px",
              height: "288px",
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
            Every day, volunteers play a vital role in making this mission
            possible. God created you with unique gifts, passions, and talents.
            When you serve with Versemate, you'll use them to help others
            encounter Scripture clearly and grow deeper in faith. Whether you
            love languages, prayer, or problem-solving, there's a place for you
            here. And don't worry - we'll provide training and support so you
            can serve with confidence.
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
          height: "936px",
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
            height: "744px",
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
              height: "144px",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
            }}
          >
            <h2
              style={{
                width: "419px",
                height: "32px",
                fontFamily: "var(--font-inter)",
                fontStyle: "normal",
                fontWeight: 700,
                fontSize: "24px",
                lineHeight: "32px",
                color: "#000000",
                flex: "none",
                order: 0,
                margin: 0,
              }}
            >
              Join the VerseMate Volunteer Team
            </h2>
            <p
              style={{
                width: "600px",
                height: "96px",
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
              We'd love to hear from you! If you're interested in getting
              involved with VerseMate, please fill out the form below. Tell us a
              bit about yourself, your skills, and what excites you about getting
              involved. Our team will connect with you soon to help you find the
              best fit.
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
            {/* Name Input */}
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
                  htmlFor="name"
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
                    fontWeight: 500,
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
                id="name"
                name="name"
                required
                value={formData.name}
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
                placeholder="Enter your name"
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
                  htmlFor="email"
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
                    fontWeight: 500,
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

            {/* Phone Input */}
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
                  htmlFor="phone"
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
                    fontWeight: 500,
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
                type="tel"
                id="phone"
                name="phone"
                required
                value={formData.phone}
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
                placeholder="Enter your phone number"
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
                placeholder="Share your skills, interests, and what excites you about volunteering"
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
