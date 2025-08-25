"use client";

export default function MobileWhyVersemate() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "48px 24px",
        gap: "48px",
        isolation: "isolate",
        width: "440px",
        height: "592px",
        flex: "none",
        order: 2,
        flexGrow: 0,
        position: "relative",
        margin: "0 auto",
        maxWidth: "100vw",
        overflow: "hidden",
      }}
    >
      {/* Image */}
      <div
        style={{
          position: "absolute",
          width: "440px",
          height: "592px",
          left: "0px",
          top: "0px",
          flex: "none",
          order: 0,
          flexGrow: 0,
          zIndex: 0,
        }}
      >
        {/* Background Image */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "592px",
            left: "-80px",
            top: "0px",
            backgroundImage: "url(/why-versemate.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        {/* Overlay */}
        <div
          style={{
            position: "absolute",
            width: "440px",
            height: "592px",
            left: "0px",
            top: "0px",
            background:
              "linear-gradient(90deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0) 100%)",
          }}
        />
      </div>

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
          width: "162px",
          height: "40px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 1,
          flexGrow: 0,
          zIndex: 1,
        }}
      >
        <span
          style={{
            width: "180px",
            height: "24px",
            fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "16px",
            lineHeight: "24px",
            textAlign: "center",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            flexGrow: 0,
          }}
        >
          WHY VERSEMATE
        </span>
      </div>

      {/* Text */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          gap: "16px",
          width: "392px",
          height: "408px",
          flex: "none",
          order: 2,
          alignSelf: "stretch",
          flexGrow: 0,
          zIndex: 2,
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
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
            margin: "0",
          }}
        >
          Not Just Read - Understood.
        </h2>

        {/* Description Text */}
        <div
          style={{
            width: "392px",
            height: "312px",
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
              color: "#FFFFFF",
              margin: "0",
            }}
          >
            Too many people walk away from the Bible confused or overwhelmed.
          </p>

          <p
            style={{
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#FFFFFF",
              margin: "0",
            }}
          >
            Versemate was created to change that. We believe the Word of God was
            meant to be understood - not just read.
          </p>

          <p
            style={{
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#FFFFFF",
              margin: "0",
            }}
          >
            That's why we built a free, accessible platform that uses modern
            tools to explain timeless Scripture with clarity and faithfulness.
          </p>

          <p
            style={{
              fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#FFFFFF",
              margin: "0",
            }}
          >
            No paywalls. No clutter. Just the truth of God's Word, made simple.
          </p>
        </div>
      </div>
    </section>
  );
}
