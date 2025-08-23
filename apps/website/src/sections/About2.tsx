export default function About2Section() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "83px 120px",
        gap: "69px",
        width: "1440px",
        height: "740px",
        background: "#F6F3EC",
        flex: "none",
        order: 6,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 6,
        margin: "0 auto",
      }}
    >
      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "0px",
          gap: "69px",
          width: "1200px",
          height: "480px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "0px",
            gap: "16px",
            width: "651px",
            height: "304px",
            flex: "none",
            order: 0,
            flexGrow: 1,
          }}
        >
          {/* Main Heading */}
          <h2
            style={{
              width: "651px",
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
            Illuminating God&rsquo;s Word for Everyone
          </h2>

          {/* Description Text */}
          <p
            style={{
              width: "651px",
              height: "160px",
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
            We believe the Bible isn&rsquo;t just for scholars or clergy -
            it&rsquo;s for everyone. Whether you&rsquo;re discovering Scripture
            for the first time or leading a study group, Versemate helps
            illuminate God&rsquo;s Word for real understanding and lasting
            transformation.
          </p>
        </div>

        {/* Image */}
        <div
          style={{
            width: "480px",
            height: "480px",
            backgroundImage: "url(/group.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: "50px",
            flex: "none",
            order: 1,
            flexGrow: 0,
          }}
        />
      </div>
    </section>
  );
}
