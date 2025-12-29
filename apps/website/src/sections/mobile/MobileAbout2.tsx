"use client";

export default function MobileAbout2() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "48px 24px",
        gap: "32px",
        isolation: "isolate",
        width: "440px",
        height: "736px",
        background: "#F6F3EC",
        flex: "none",
        order: 1,
        alignSelf: "stretch",
        flexGrow: 0,
        margin: "0 auto",
        maxWidth: "100vw",
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
          gap: "32px",
          width: "392px",
          height: "640px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Image */}
        <div
          style={{
            width: "392px",
            height: "392px",
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
            width: "392px",
            height: "216px",
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
              textAlign: "left",
              wordWrap: "break-word",
              hyphens: "none",
            }}
          >
            Illuminating God's
            <br />
            Word for Everyone
          </h2>

          {/* Description Text */}
          <div
            style={{
              width: "392px",
              height: "120px",
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
                color: "#3E464D",
                margin: "0",
              }}
            >
              We believe the Bible isn't just for scholars or clergy - it's for
              everyone. Whether you're discovering Scripture for the first time
              or leading a study group, Versemate helps illuminate God's Word
              for real understanding and lasting transformation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
