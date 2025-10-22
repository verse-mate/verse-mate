export default function Global() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "96px 64px",
        gap: "64px",
        width: "1024px",
        height: "864px",
        background: "#FFFFFF",
        flex: "none",
        order: 3,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 3,
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
        <h2
          style={{
            width: "343px",
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
          Global And Growing
        </h2>
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
          width: "896px",
          height: "560px",
          flex: "none",
          order: 1,
          alignSelf: "stretch",
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
            width: "432px",
            height: "560px",
            flex: "none",
            order: 1,
            flexGrow: 1,
          }}
        >
          {/* Main Heading */}
          <h1
            style={{
              width: "432px",
              height: "192px",
              fontFamily: "var(--font-merriweather, Merriweather, serif)",
              fontStyle: "normal",
              fontWeight: 600,
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
          </h1>

          {/* Description */}
          <p
            style={{
              width: "432px",
              height: "352px",
              fontFamily: "var(--font-inter)",
              fontStyle: "normal",
              fontWeight: 300,
              fontSize: "24px",
              lineHeight: "32px",
              color: "#3E464D",
              flex: "none",
              order: 1,
              alignSelf: "stretch",
              flexGrow: 0,
            }}
          >
            Versemate is powered by believers across the globe - developers, translators, and thinkers working together in faith.
            <br /><br />
            Our tools are modern. Our foundation is eternal.
            <br /><br />
            Together, we&rsquo;re helping more people encounter Scripture clearly, every day, in every language.
          </p>
        </div>
      </div>
    </section>
  );
}