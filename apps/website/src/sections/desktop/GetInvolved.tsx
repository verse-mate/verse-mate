import Link from "next/link";

export default function GetInvolvedSection() {
  return (
    <section
      style={{
        width: "100vw",
        height: "1234px",
        background: "linear-gradient(180deg, #1B1B1B 0%, #000000 100%)",
        flex: "none",
        order: 4,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 4,
      }}
    >
      {/* Content Container - maintains 1440px layout */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "96px 120px",
          gap: "80px",
          width: "1440px",
          height: "100%",
          margin: "0 auto",
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
          width: "203px",
          height: "48px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "203px",
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
            flexGrow: 0,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Get Involved
        </span>
      </div>

      {/* Group of cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          padding: "0px",
          gap: "80px",
          width: "1200px",
          height: "736px",
          flex: "none",
          order: 1,
          flexGrow: 0,
        }}
      >
        {/* Volunteer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            width: "560px",
            height: "736px",
            flex: "none",
            order: 0,
            flexGrow: 1,
          }}
        >
          {/* Volunteer Title */}
          <h2
            style={{
              width: "560px",
              height: "64px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "48px",
              lineHeight: "64px",
              textAlign: "center",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Volunteer
          </h2>

          {/* Content */}
          <div
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px 0px 64px",
              gap: "40px",
              width: "560px",
              height: "648px",
              background: "rgba(255, 255, 255, 0.1)",
              boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "560px",
                height: "280px",
                backgroundImage: "url(/volunteer.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "50px 50px 0px 0px",
                flex: "none",
                order: 0,
                flexGrow: 0,
              }}
            />

            {/* Text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 24px",
                gap: "16px",
                width: "560px",
                height: "144px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "512px",
                  height: "32px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "24px",
                  lineHeight: "32px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                }}
              >
                Want to Help People Understand the Bible?
              </h3>

              <p
                style={{
                  width: "512px",
                  height: "96px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "24px",
                  lineHeight: "32px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  opacity: 0.5,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                }}
              >
                We&rsquo;re looking for developers, testers, translators, and
                people of faith who want to make an eternal impact.
              </p>
            </div>

            {/* Button Container */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: "0px 100px",
                gap: "8px",
                width: "560px",
                height: "80px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <a
                href="mailto:info@versemate.org?subject=I want to volunteer&body=Hi, I'm interested in helping with VerseMate..."
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "24px 48px",
                  gap: "8px",
                  width: "360px",
                  height: "80px",
                  background: "#C2B291",
                  borderRadius: "100px",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: "235px",
                    height: "32px",
                    fontFamily: "var(--font-inter)",
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
                  Join the Volunteer Team
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Give */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            width: "560px",
            height: "736px",
            flex: "none",
            order: 1,
            flexGrow: 1,
          }}
        >
          {/* Give Title */}
          <h2
            style={{
              width: "560px",
              height: "64px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "48px",
              lineHeight: "64px",
              textAlign: "center",
              color: "#FFFFFF",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Give
          </h2>

          {/* Content */}
          <div
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px 0px 64px",
              gap: "40px",
              width: "560px",
              height: "648px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              flexGrow: 0,
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "560px",
                height: "280px",
                backgroundImage: "url(/give.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "50px 50px 0px 0px",
                flex: "none",
                order: 0,
                flexGrow: 0,
              }}
            />

            {/* Text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 24px",
                gap: "16px",
                width: "560px",
                height: "144px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "512px",
                  height: "32px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "24px",
                  lineHeight: "32px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                }}
              >
                Believe in the Mission?
              </h3>

              <p
                style={{
                  width: "512px",
                  height: "96px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  fontSize: "24px",
                  lineHeight: "32px",
                  textAlign: "center",
                  color: "#FFFFFF",
                  opacity: 0.5,
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                }}
              >
                Your gift keeps Versemate 100% free and accessible to people
                around the world seeking to understand God&rsquo;s Word.
              </p>
            </div>

            {/* Button Container */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: "0px 100px",
                gap: "8px",
                width: "560px",
                height: "80px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <a
                href="mailto:donations@versemate.org?subject=I want to make a donation&body=Hi, I'm interested in supporting VerseMate with a donation..."
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "24px 48px",
                  gap: "8px",
                  width: "360px",
                  height: "80px",
                  background: "#C2B291",
                  borderRadius: "100px",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: "162px",
                    height: "32px",
                    fontFamily: "var(--font-inter)",
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
                  Make a Donation
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom text */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          gap: "24px",
          width: "1200px",
          height: "80px",
          flex: "none",
          order: 2,
          flexGrow: 0,
        }}
      >
        <p
          style={{
            width: "1200px",
            height: "32px",
            fontFamily: "Inter",
            fontStyle: "normal",
            fontWeight: 500,
            fontSize: "20px",
            lineHeight: "32px",
            textAlign: "center",
            color: "#C2B291",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          Versemate is a 501(c)(3) nonprofit making the Bible easier to
          understand—for everyone, forever.
        </p>

        <p
          style={{
            width: "1200px",
            height: "24px",
            fontFamily: "Inter",
            fontStyle: "normal",
            fontWeight: 300,
            fontSize: "16px",
            lineHeight: "24px",
            textAlign: "center",
            color: "#FFFFFF",
            opacity: 0.5,
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          Donations are tax-deductible in the U.S. | Built by believers. Guided
          by the Word.
        </p>
      </div>
      </div>
    </section>
  );
}
