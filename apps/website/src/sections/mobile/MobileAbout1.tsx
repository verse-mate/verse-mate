"use client";

export default function MobileAbout1() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
        gap: "48px",
        width: "440px",
        height: "968px",
        background: "#FFFFFF",
        flex: "none",
        order: 5,
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
          width: "64px",
          height: "40px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "64px",
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
          About
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0px",
          gap: "32px",
          width: "392px",
          height: "784px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Image */}
        <div
          style={{
            width: "392px",
            height: "392px",
            backgroundImage: "url(/bible.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: "50px",
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
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "392px",
            height: "360px",
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
            }}
          >
            Built by Believers. Guided by the Word.
          </h2>

          {/* Description Text */}
          <div
            style={{
              width: "392px",
              height: "264px",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0px",
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
              }}
            >
              Versemate is a nonprofit organization on a mission to make the
              Bible easier to understand, study, and love - for everyone,
              everywhere.
            </p>
            <p
              style={{
                fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)",
                fontStyle: "normal",
                fontWeight: 300,
                fontSize: "16px",
                lineHeight: "24px",
                color: "#3E464D",
                margin: "0 0 16px 0",
              }}
            >
              We are developers, translators, and believers from around the
              world, united by one calling: to help more people connect with God
              through His Word.
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
              }}
            >
              To make the Word of God easy to understand, deeply accessible, and
              free to everyone - so more people around the world can encounter
              Scripture, grow in faith, and walk closer with Christ.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
