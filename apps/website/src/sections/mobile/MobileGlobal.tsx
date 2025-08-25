"use client";

export default function MobileGlobal() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
        gap: "48px",
        width: "440px",
        height: "824px",
        background: "#FFFFFF",
        flex: "none",
        order: 3,
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
          width: "215px",
          height: "40px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "215px",
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
            whiteSpace: "nowrap",
          }}
        >
          Global and Growing
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0px",
          gap: "32px",
          width: "392px",
          height: "640px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Icons */}
        <div
          style={{
            width: "320px",
            height: "320px",
            backgroundImage: "url(/globalandgrowing-icon.png)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
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
            alignItems: "center",
            padding: "0px",
            gap: "16px",
            width: "392px",
            height: "288px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Main Heading */}
          <h2
            style={{
              width: "392px",
              height: "80px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "32px",
              lineHeight: "40px",
              color: "#000000",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
              margin: "0",
              textAlign: "center",
            }}
          >
            Built Worldwide. Anchored in the Word.
          </h2>

          {/* Description Text */}
          <div
            style={{
              width: "392px",
              height: "192px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#3E464D",
                margin: "0",
                textAlign: "center",
              }}
            >
              Versemate is powered by believers across the globe - developers,
              translators, and thinkers working together in faith.
            </p>

            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#3E464D",
                margin: "0",
                textAlign: "center",
              }}
            >
              Our tools are modern. Our foundation is eternal.
            </p>

            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#3E464D",
                margin: "0",
                textAlign: "center",
              }}
            >
              Together, we're helping more people encounter Scripture clearly,
              every day, in every language.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
