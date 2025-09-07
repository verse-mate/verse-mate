export default function WhyVersemateSection() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "96px 120px",
        gap: "64px",
        width: "1440px",
        height: "896px",
        background:
          "linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%), url(/why-versemate.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        flex: "none",
        order: 2,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 2,
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
          width: "242px",
          height: "48px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "252px",
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
          width: "520px",
          height: "592px",
          flex: "none",
          order: 1,
          flexGrow: 0,
        }}
      >
        {/* Main Heading */}
        <h2
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
        </h2>

        {/* Description Text */}
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
          Too many people walk away from the Bible
          <br />
          confused or over whelmed.
          <br />
          <br />
          Versemate was created to change that.
          <br />
          We believe the Word of God was meant to be
          <br />
          understood - not just read.
          <br />
          <br />
          That&rsquo;s why we built a free, accessible
          <br />
          platform t hat uses modern tools to explain
          <br />
          timeless Scripture with clarity and
          <br />
          fait hfulness .<br />
          <br />
          No paywalls. No clutter. Just the truth of
          <br />
          God&rsquo;s Word, made simple.
        </p>
      </div>
    </section>
  );
}
