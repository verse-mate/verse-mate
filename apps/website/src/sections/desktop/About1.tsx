export default function About1Section() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "83px 120px",
        gap: "69px",
        width: "1440px",
        height: "779px",
        background: "#FFFFFF",
        flex: "none",
        order: 5,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 5,
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
          width: "96px",
          height: "48px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "96px",
            height: "32px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "24px",
            lineHeight: "32px",
            textAlign: "center",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#1B1B1B",
            flex: "none",
            order: 0,
            flexGrow: 0,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          About
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "0px",
          gap: "64px",
          width: "1200px",
          height: "496px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Image */}
        <div
          style={{
            width: "480px",
            height: "480px",
            backgroundImage: "url(/bible.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: "50px",
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
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "656px",
            height: "496px",
            flex: "none",
            order: 1,
            flexGrow: 1,
          }}
        >
          {/* Main Heading */}
          <h2
            style={{
              width: "656px",
              height: "128px",
              fontFamily: "var(--font-merriweather)",
              fontStyle: "normal",
              fontWeight: 700,
              fontSize: "48px",
              lineHeight: "64px",
              color: "#000000",
              flex: "none",
              order: 0,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Built by Believers.
            <br />
            Guided by the Word.
          </h2>

          {/* Description Text */}
          <p
            style={{
              width: "656px",
              height: "352px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 400,
              fontSize: "24px",
              lineHeight: "32px",
              color: "#3E464D",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Versemate is a nonprofit organization on a mission to make the Bible
            easier to understand, study, and love - for everyone, everywhere.
            <br />
            We are developers, translators, and believers from around the world,
            united by one calling: to help more people connect with God through
            His Word.
            <br />
            <br />
            To make the Word of God easy to understand, deeply accessible, and
            free to everyone - so more people around the world can encounter
            Scripture, grow in faith, and walk closer with Christ.
          </p>
        </div>
      </div>
    </section>
  );
}
