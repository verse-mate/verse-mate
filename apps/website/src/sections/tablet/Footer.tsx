import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "48px 64px",
        width: "1024px",
        height: "180px",
        background: "#1B1B1B",
        flex: "none",
        order: 7,
        alignSelf: "stretch",
        flexGrow: 0,
        zIndex: 7,
      }}
    >
      {/* Page Links */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0px",
          gap: "48px",
          width: "896px",
          height: "34px",
          flex: "none",
          order: 0,
          alignSelf: "stretch",
          flexGrow: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: "124px",
            height: "34px",
            flex: "none",
            order: 0,
            flexGrow: 0,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              height: "100%",
              padding: "0",
              margin: "0",
              position: "relative",
            }}
          >
            <Image
              src="/versemate-logo.png"
              alt="VerseMate"
              width={124}
              height={34}
              style={{
                objectFit: "contain",
                filter: "brightness(0) invert(1)",
              }}
            />
          </Link>
        </div>

        {/* Footer Links */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            padding: "0px",
            gap: "24px",
            height: "24px",
            flex: "none",
            order: 1,
            flexGrow: 0,
          }}
        >
          <Link
            href="/privacy"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: "14px",
              lineHeight: "24px",
              color: "#FFFFFF",
              textDecoration: "none",
            }}
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
