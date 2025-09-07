"use client";

export default function MobileHowItWorks() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
        gap: "48px",
        width: "440px",
        height: "1229px",
        background:
          "radial-gradient(50% 50% at 50% 50%, #FFFFFF 0%, #F1EDE3 100%)",
        borderRadius: "0px",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
        margin: "0 auto",
        maxWidth: "100vw",
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
          width: "152px",
          height: "40px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "170px",
            height: "24px",
            fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "16px",
            lineHeight: "24px",
            textAlign: "center",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#1B1B1B",
            flex: "none",
            order: 0,
            flexGrow: 0,
          }}
        >
          How it works?
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0px",
          gap: "40px",
          width: "392px",
          height: "1045px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Text group */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0px",
            gap: "16px",
            width: "392px",
            height: "192px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          <h2
            style={{
              width: "392px",
              height: "80px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "32px",
              lineHeight: "40px",
              textAlign: "center",
              color: "#000000",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Explore Scripture
            <br />
            Your Way.
          </h2>
          <p
            style={{
              width: "396px",
              height: "96px",
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "16px",
              lineHeight: "24px",
              textAlign: "center",
              color: "#3E464D",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
            }}
          >
            Whether you're new to the Word or someone looking
            <br />
            to dive deeper, Versemate gives you the clarity and
            <br />
            depth you need - to grow in faith and
            <br />
            understanding.
          </p>
        </div>

        {/* Images and description */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0px",
            gap: "40px",
            width: "392px",
            height: "725px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Frame 1 */}
          <div
            style={{
              width: "392px",
              height: "368px",
              flex: "none",
              order: 0,
              flexGrow: 0,
              position: "relative",
            }}
          >
            {/* Summary */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "4px",
                position: "absolute",
                width: "234px",
                height: "214px",
                left: "43px",
                top: "0px",
                background: "rgba(0, 0, 0, 0.001)",
                boxShadow: "2.22096px 2.22096px 27.762px rgba(0, 0, 0, 0.1)",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  width: "226px",
                  height: "206px",
                  backgroundImage: "url(/howitworks1.png)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  borderRadius: "8px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              />
            </div>

            {/* By Line */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "4px",
                position: "absolute",
                width: "234px",
                height: "215px",
                left: "158px",
                top: "64px",
                background: "rgba(0, 0, 0, 0.001)",
                boxShadow: "2.22096px 2.22096px 27.762px rgba(0, 0, 0, 0.1)",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  width: "226px",
                  height: "207px",
                  backgroundImage: "url(/howitworks2.png)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  borderRadius: "8px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              />
            </div>

            {/* Detailed */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "4px",
                position: "absolute",
                width: "234px",
                height: "214px",
                left: "0px",
                top: "154px",
                background: "rgba(0, 0, 0, 0.001)",
                boxShadow: "2.22096px 2.22096px 27.762px rgba(0, 0, 0, 0.1)",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  width: "226px",
                  height: "206px",
                  backgroundImage: "url(/howitworks3.png)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  borderRadius: "8px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0px",
              gap: "24px",
              width: "392px",
              height: "317px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            {/* Summary View */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "8px",
                width: "392px",
                height: "85px",
                borderRadius: "20px",
                flex: "none",
                order: 0,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "392px",
                  height: "29px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "20px",
                  lineHeight: "24px",
                  color: "#1B1B1B",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Summary View
              </h3>
              <p
                style={{
                  width: "392px",
                  height: "48px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 300,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#3E464D",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Get a summary, line-by-line breakdown, or in-depth analysis.
              </p>
            </div>

            {/* Line by Line */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "8px",
                width: "392px",
                height: "80px",
                borderRadius: "20px",
                flex: "none",
                order: 1,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "392px",
                  height: "24px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "20px",
                  lineHeight: "24px",
                  color: "#1B1B1B",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Line by Line
              </h3>
              <p
                style={{
                  width: "392px",
                  height: "48px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 300,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#3E464D",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Thoughtful commentary for every verse - perfect for learning,
                reflecting, and growing in faith.
              </p>
            </div>

            {/* In-Depth Study */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0px",
                gap: "8px",
                width: "392px",
                height: "104px",
                borderRadius: "20px",
                flex: "none",
                order: 2,
                alignSelf: "stretch",
                flexGrow: 0,
              }}
            >
              <h3
                style={{
                  width: "392px",
                  height: "24px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 700,
                  fontSize: "20px",
                  lineHeight: "24px",
                  color: "#1B1B1B",
                  flex: "none",
                  order: 0,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                In-Depth Study
              </h3>
              <p
                style={{
                  width: "392px",
                  height: "72px",
                  fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                  fontStyle: "normal",
                  fontWeight: 300,
                  fontSize: "16px",
                  lineHeight: "24px",
                  color: "#3E464D",
                  flex: "none",
                  order: 1,
                  alignSelf: "stretch",
                  flexGrow: 0,
                  margin: "0",
                }}
              >
                Rich theological insight with context, cross-references, and
                language tools - built for serious Bible study.
              </p>
            </div>
          </div>
        </div>

        {/* Text Line */}
        <p
          style={{
            width: "392px",
            height: "48px",
            fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
            fontStyle: "normal",
            fontWeight: 500,
            fontSize: "16px",
            lineHeight: "24px",
            textAlign: "center",
            color: "#1B1B1B",
            flex: "none",
            order: 2,
            alignSelf: "stretch",
            flexGrow: 0,
            margin: "0",
          }}
        >
          Available in multiple Bible versions and languages - so anyone,
          anywhere, can understand the truth.
        </p>
      </div>
    </section>
  );
}
