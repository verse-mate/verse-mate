/**
 * Mobile Volunteer Landing Page with Form
 */

import React, { useState } from "react";
import MobileHeader from "@/sections/mobile/MobileHeader";
import MobileFooter from "@/sections/mobile/MobileFooter";

export default function MobileVolunteerPage() {
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

I'm interested in volunteering with VerseMate! Here are my details:

First Name: ${formData.firstName}
Last Name: ${formData.lastName}
Email: ${formData.email}

Additional Information:
${formData.message || 'No additional information provided.'}

Thank you for considering my application to volunteer!

Best regards,
${formData.firstName} ${formData.lastName}`;

    // Create mailto URL with subject and body
    const subject = encodeURIComponent('Volunteer Application - ' + formData.firstName + ' ' + formData.lastName);
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:info@versemate.org?subject=${subject}&body=${body}`;

    // Open email client
    window.location.href = mailtoUrl;
  };

  return (
    <>
      <MobileHeader />
      <div
        data-testid="mobile-volunteer-page"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "76px 0px 0px",
          position: "relative",
          width: "100vw",
          maxWidth: "440px",
          margin: "0 auto",
          minHeight: "100vh",
          background: "#FFFFFF"
        }}
      >
        {/* Serve with Versemate Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "48px 24px",
          gap: "48px",
          width: "100%",
          height: "648px",
          background: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/Tilted Image text Mobile.png'), url('/ServeWithVersemate.png')",
          backgroundSize: "cover",
          backgroundPosition: "80% center",
          borderRadius: "0px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
          position: "relative"
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
            width: "232px",
            height: "40px",
            borderBottom: "6px solid #C2B291",
            flex: "none",
            order: 0,
            flexGrow: 0
          }}
        >
          <div
            style={{
              width: "252px",
              height: "24px",
              fontFamily: "Inter",
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
              flexGrow: 0
            }}
          >
            SERVE WITH VERSEMATE
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
            width: "100%",
            maxWidth: "392px",
            height: "464px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0
          }}
        >
          {/* Hero text */}
          <div
            style={{
              width: "100%",
              height: "160px",
              fontFamily: "Merriweather",
              fontStyle: "normal",
              fontWeight: 600,
              fontSize: "32px",
              lineHeight: "40px",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0
            }}
          >
            Versemate exists to help people everywhere truly understand God's Word - not just read it.
          </div>

          {/* Description text */}
          <div
            style={{
              width: "100%",
              height: "288px",
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
              display: "flex",
              flexDirection: "column",
              gap: "16px"
            }}
          >
            <p style={{ margin: 0 }}>
              Every day, volunteers play a vital role in making this mission possible.
            </p>
            <p style={{ margin: 0 }}>
              God created you with unique gifts, passions, and talents. When you serve with Versemate, you'll use them to help others encounter Scripture clearly and grow deeper in faith.
            </p>
            <p style={{ margin: 0 }}>
              Whether you love languages, prayer, or problem-solving, there's a place for you here. And don't worry - we'll provide training and support so you can serve with confidence.
            </p>
          </div>
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
            width: "100%",
            maxWidth: "392px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
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
              width: "100%",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0
            }}
          >
            <h2
              style={{
                width: "100%",
                height: "24px",
                fontFamily: "Inter",
                fontStyle: "normal",
                fontWeight: 600,
                fontSize: "20px",
                lineHeight: "24px",
                color: "#000000",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
                margin: 0,
                textAlign: "left"
              }}
            >
              Join the VerseMate Volunteer Team
            </h2>
            <p
              style={{
                width: "100%",
                height: "144px",
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
              We'd love to hear from you! If you're interested in getting involved with VerseMate, please fill out the form below. Tell us a bit about yourself, your skills, and what excites you about getting involved. Our team will connect with you soon to help you find the best fit.
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
              width: "100%",
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
                width: "100%",
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
                  width: "100%",
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
                width: "100%",
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
                  width: "100%",
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
                width: "100%",
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
                  width: "100%",
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
                width: "100%",
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
                  width: "100%",
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
                width: "100%",
                height: "80px",
                background: "#C2B291",
                borderRadius: "100px",
                border: "none",
                cursor: "pointer",
                flex: "none",
                order: 4,
                alignSelf: "stretch",
                flexGrow: 0
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

      </div>
      <MobileFooter />
    </>
  );
}
