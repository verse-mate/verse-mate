export default function WhyVersemate() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "96px 64px",
        gap: "64px",
        width: "1024px",
        height: "896px",
        background: "linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%), url(/why-versemate.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        flex: "none",
        order: 2,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 2,
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
          width: "242px",
          height: "48px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <h2
          style={{
            width: "262px",
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
          Why Versemate
        </h2>
      </div>

      {/* Text */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: "0px",
          gap: "16px",
          width: "520px",
          height: "592px",
          flex: "none",
          order: 1,
          flexGrow: 0,
        }}
      >
        {/* Main Heading */}
        <h1
          style={{
            width: "520px",
            height: "128px",
            fontFamily: "var(--font-merriweather, Merriweather, serif)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: "48px",
            lineHeight: "64px",
            color: "#FFFFFF",
            flex: "none",
            order: 0,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          Not Just Read - Understood.
        </h1>

        {/* Description */}
        <p
          style={{
            width: "520px",
            height: "448px",
            fontFamily: "var(--font-inter)",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "24px",
            lineHeight: "32px",
            color: "#FFFFFF",
            flex: "none",
            order: 1,
            alignSelf: "stretch",
            flexGrow: 0,
          }}
        >
          Too many people walk away from the Bible confused or overwhelmed.
          <br /><br />
          Versemate was created to change that. We believe the Word of God was meant to be understood - not just read.
          <br /><br />
          That&rsquo;s why we built a free, accessible platform that uses modern tools to explain timeless Scripture with clarity and faithfulness.
          <br /><br />
          No paywalls. No clutter. Just the truth of God&rsquo;s Word, made simple.
        </p>
      </div>
    </section>
  );
}