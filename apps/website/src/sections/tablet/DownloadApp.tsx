export default function DownloadAppSection() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "91px 64px",
        isolation: "isolate",
        position: "relative",
        width: "1024px",
        height: "976px",
        background: "#F6F3EC",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
        margin: "0 auto",
      }}
    >
      {/* Text Line - Always free */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          padding: "0px",
          gap: "8px",
          position: "absolute",
          width: "1024px",
          height: "32px",
          left: "calc(50% - 1024px/2)",
          bottom: "40px",
          flex: "none",
          order: 0,
          flexGrow: 0,
          zIndex: 0,
        }}
      >
        <span
          style={{
            width: "572px",
            height: "32px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "24px",
            lineHeight: "32px",
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

      {/* Text Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0px",
          gap: "40px",
          width: "523px",
          height: "658px",
          flex: "none",
          order: 1,
          flexGrow: 0,
          zIndex: 1,
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
            width: "523px",
            height: "416px",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Main Heading */}
          <h1
            style={{
              width: "523px",
              height: "128px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "48px",
              lineHeight: "64px",
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
              width: "523px",
              height: "64px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
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
              width: "523px",
              height: "192px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
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
            width: "523px",
            height: "104px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Download VerseMate Now */}
          <h2
            style={{
              width: "523px",
              height: "32px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "24px",
              lineHeight: "32px",
              color: "#1B1B1B",
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
              width: "523px",
              height: "64px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
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

          {/* Frame 10 - App Store Buttons Container */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              padding: "0px",
              gap: "14px",
              width: "407.95px",
              height: "58px",
              flex: "none",
              order: 2,
              flexGrow: 0,
            }}
          >
            {/* Frame 8 - App Store Button */}
            <a
              href="https://apps.apple.com/app/verse-mate"
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
                flexGrow: 0,
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
              href="https://play.google.com/store/apps/details?id=org.versemate"
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
                flexGrow: 0,
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
          width: "499px",
          height: "649px",
          flex: "none",
          order: 2,
          flexGrow: 0,
          zIndex: 2,
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
    </section>
  );
}
