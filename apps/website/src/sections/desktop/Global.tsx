export default function GlobalSection() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "96px 120px",
        gap: "64px",
        width: "1440px",
        height: "800px",
        background: "#FFFFFF",
        flex: "none",
        order: 3,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 3,
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
          width: "323px",
          height: "48px",
          borderBottom: "6px solid #C2B291",
          flex: "none",
          order: 0,
          flexGrow: 0,
        }}
      >
        <span
          style={{
            width: "323px",
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
          Global and Growing
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          padding: "0px",
          gap: "64px",
          width: "1200px",
          height: "400px",
          flex: "none",
          order: 1,
          flexGrow: 0,
        }}
      >
        {/* Icons */}
        <div
          style={{
            width: "400px",
            height: "400px",
            backgroundImage: "url(/globalandgrowing-icon.png)",
            backgroundSize: "cover",
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
            alignItems: "flex-end",
            padding: "0px",
            gap: "16px",
            width: "736px",
            height: "368px",
            flex: "none",
            order: 1,
            flexGrow: 1,
          }}
        >
          {/* Main Heading */}
          <h2
            style={{
              width: "736px",
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
            Built Worldwide. Anchored in the Word.
          </h2>

          {/* Description Text */}
          <p
            style={{
              width: "736px",
              height: "224px",
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
            Versemate is powered by believers across the globe - developers,
            translators, and thinkers working together in faith.
            <br />
            <br />
            Our tools are modern. Our foundation is eternal.
            <br />
            <br />
            Together, we&rsquo;re helping more people encounter Scripture
            clearly, every day, in every language.
          </p>
        </div>
      </div>
    </section>
  );
}
