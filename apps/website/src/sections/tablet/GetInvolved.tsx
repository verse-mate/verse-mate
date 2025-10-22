import Link from "next/link";

export default function GetInvolved() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "96px 64px",
        gap: "64px",
        width: "1024px",
        height: "1214px",
        background: "linear-gradient(180deg, #1B1B1B 0%, #000000 100%)",
        flex: "none",
        order: 4,
        flexGrow: 0,
        zIndex: 4,
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
        <h2
          style={{
            width: "223px",
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
            flexGrow: 0,
          }}
        >
          Get Involved
        </h2>
      </div>

      {/* Group of cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          padding: "0px",
          gap: "40px",
          width: "896px",
          height: "734px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Volunteer Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            width: "428px",
            height: "734px",
            flex: "none",
            order: 0,
            flexGrow: 1,
          }}
        >
          {/* Volunteer Title */}
          <h3
            style={{
              width: "428px",
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
          </h3>

          {/* Content */}
          <div
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px 0px 64px",
              gap: "40px",
              width: "428px",
              height: "646px",
              background: "rgba(255, 255, 255, 0.1)",
              boxShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "428px",
                height: "214px",
                backgroundImage: "url(/volunteer.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "0px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
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
                width: "428px",
                height: "208px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h4
                style={{
                  width: "380px",
                  height: "64px",
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
              </h4>

              <p
                style={{
                  width: "380px",
                  height: "128px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 300,
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
                We&rsquo;re looking for developers, testers, translators, and people of faith who want to make an eternal impact.
              </p>
            </div>

            {/* Button Container */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 32px",
                gap: "8px",
                width: "428px",
                height: "80px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <Link
                href="/volunteer"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "24px 48px",
                  gap: "8px",
                  width: "364px",
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
                    fontWeight: 500,
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
              </Link>
            </div>
          </div>
        </div>

        {/* Give Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            width: "428px",
            height: "734px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 1,
          }}
        >
          {/* Give Title */}
          <h3
            style={{
              width: "428px",
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
          </h3>

          {/* Content */}
          <div
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px 0px 64px",
              gap: "40px",
              width: "428px",
              height: "646px",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "50px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 1,
            }}
          >
            {/* Image */}
            <div
              style={{
                width: "428px",
                height: "214px",
                backgroundImage: "url(/give.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "0px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            />

            {/* Text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "0px 24px",
                gap: "16px",
                width: "428px",
                height: "208px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h4
                style={{
                  margin: "0 auto",
                  width: "380px",
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
              </h4>

              <p
                style={{
                  margin: "0 auto",
                  width: "380px",
                  height: "128px",
                  fontFamily: "var(--font-inter)",
                  fontStyle: "normal",
                  fontWeight: 300,
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
                Your gift keeps Versemate 100% free and accessible to people around the world seeking to understand God&rsquo;s Word.
              </p>
            </div>

            {/* Button Container */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px 32px",
                gap: "8px",
                width: "428px",
                height: "80px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <Link
                href="/give"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "24px 48px",
                  gap: "8px",
                  width: "364px",
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
                    fontWeight: 500,
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
              </Link>
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
          width: "896px",
          height: "112px",
          flex: "none",
          order: 2,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        <p
          style={{
            width: "896px",
            height: "64px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 400,
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
          Versemate is a 501(c)(3) nonprofit making the Bible easier to understand - for everyone, forever.
        </p>

        <p
          style={{
            width: "896px",
            height: "24px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 200,
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
          Donations are tax-deductible in the U.S. | Built by believers. Guided by the Word.
        </p>
      </div>
    </section>
  );
}