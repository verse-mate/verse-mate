"use client";

export default function MobileDownloadApp() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "48px 16px",
        gap: "32px",
        width: "440px",
        height: "1168px",
        background: "#F6F3EC",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
      }}
    >
      {/* Text Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0px",
          gap: "32px",
          width: "408px",
          height: "482px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Frame 6 - Main Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "408px",
            height: "280px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Main Heading */}
          <h1
            style={{
              width: "408px",
              height: "80px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "32px",
              lineHeight: "40px",
              color: "#000000",
              margin: 0,
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Understand God&rsquo;s Word with VerseMate
          </h1>

          {/* Subheading */}
          <p
            style={{
              width: "408px",
              height: "48px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#3E464D",
              margin: 0,
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            When people truly understand Scripture, lives change.
          </p>

          {/* Description */}
          <p
            style={{
              width: "408px",
              height: "120px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#3E464D",
              margin: 0,
              flex: "none",
              order: 2,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            VerseMate helps anyone, anywhere explore God&rsquo;s Word with
            clarity and faithful insight. Choose your depth—Summary,
            Line-by-Line, or In-Depth Study. Available in multiple Bible
            versions and languages.
          </p>
        </div>

        {/* Frame 7 - Download Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0px",
            gap: "8px",
            width: "408px",
            height: "80px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Download VerseMate Now */}
          <h2
            style={{
              width: "408px",
              height: "24px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "20px",
              lineHeight: "24px",
              color: "#000000",
              margin: 0,
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Download VerseMate Now
          </h2>

          {/* Description */}
          <p
            style={{
              width: "408px",
              height: "48px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#3E464D",
              margin: 0,
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            No paywalls. No clutter.
            <br />
            Just the truth of God&rsquo;s Word, made simple.
          </p>

          {/* Frame 5 - App Store Buttons Container */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              padding: "0px",
              gap: "14.05px",
              width: "408px",
              height: "58px",
              flex: "none",
              order: 2,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            {/* Frame 8 - App Store Button */}
            <a
              href="https://apps.apple.com/us/app/verse-mate/id6756897180"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: "8px 0px",
                gap: "8px",
                width: "196.98px",
                height: "58px",
                background: "#000000",
                borderRadius: "8px",
                flex: "none",
                order: 0,
                flexGrow: 1,
                textDecoration: "none",
              }}
            >
              <img
                src="/appStore.png"
                alt="Download on the App Store"
                style={{
                  width: "140px",
                  height: "42px",
                  borderRadius: "8px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              />
            </a>

            {/* Frame 9 - Google Play Button */}
            <a
              href="https://play.google.com/store/apps/details?id=org.versemate.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: "8px 0px",
                gap: "8px",
                width: "196.98px",
                height: "58px",
                background: "#000000",
                borderRadius: "8px",
                flex: "none",
                order: 1,
                flexGrow: 1,
                textDecoration: "none",
              }}
            >
              <img
                src="/googleStore.png"
                alt="Get it on Google Play"
                style={{
                  width: "140px",
                  height: "42px",
                  borderRadius: "8px",
                  flex: "none",
                  order: 0,
                  flexGrow: 0,
                }}
              />
            </a>
          </div>
        </div>
      </div>

      {/* Frame 4 1 - Phone Mockup */}
      <div
        style={{
          width: "408px",
          height: "530.65px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        <img
          src="/versemate-app-mockup.png"
          alt="VerseMate App Interface"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>

      {/* Text Line - Always free */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          padding: "0px",
          gap: "8px",
          width: "408px",
          height: "32px",
          flex: "none",
          order: 2,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "382px",
            height: "24px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "16px",
            lineHeight: "24px",
            textAlign: "center",
            letterSpacing: "0.2em",
            color: "#3E464D",
            flex: "none",
            order: 0,
            flexGrow: 0,
          }}
        >
          Always free. For everyone. Forever.
        </span>
      </div>
    </section>
  );
}
