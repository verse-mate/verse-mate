export default function About2() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px 64px",
        gap: "48px",
        isolation: "isolate",
        width: "1024px",
        height: "860px",
        background: "#F6F3EC",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 1,
      }}
    >
      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0px",
          gap: "48px",
          width: "896px",
          height: "700px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Image */}
        <div
          style={{
            width: "896px",
            height: "400px",
            backgroundImage: "url(/group.png)",
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
            height: "272px",
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
            Illuminating God&rsquo;s Word for Everyone
          </h1>

          {/* Description */}
          <p
            style={{
              width: "896px",
              height: "128px",
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
            We believe the Bible isn&rsquo;t just for scholars or clergy - it&rsquo;s for everyone. Whether you&rsquo;re discovering Scripture for the first time or leading a study group, Versemate helps illuminate God&rsquo;s Word for real understanding and lasting transformation.
          </p>
        </div>
      </div>
    </section>
  );
}