export default function About1() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "83px 64px",
        gap: "64px",
        width: "1024px",
        height: "1142px",
        background: "#FFFFFF",
        flex: "none",
        order: 5,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 5,
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
        <h2
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
          }}
        >
          About
        </h2>
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0px",
          gap: "64px",
          width: "896px",
          height: "864px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Image */}
        <div
          style={{
            width: "896px",
            height: "400px",
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
            width: "896px",
            height: "400px",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          {/* Main Heading */}
          <h1
            style={{
              width: "896px",
              height: "128px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
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
            Built by Believers. Guided by the Word.
          </h1>

          {/* Description */}
          <p
            style={{
              width: "896px",
              height: "256px",
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
            Versemate is a nonprofit organization on a mission to make the Bible easier to understand, study, and love - for everyone, everywhere. We are developers, translators, and believers from around the world, united by one calling: to help more people connect with God through His Word.
            <br /><br />
            To make the Word of God easy to understand, deeply accessible, and free to everyone - so more people around the world can encounter Scripture, grow in faith, and walk closer with Christ.
          </p>
        </div>
      </div>
    </section>
  );
}