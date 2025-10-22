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

        {/* Social Icons */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            padding: "0px",
            gap: "64px",
            width: "96px",
            height: "24px",
            flex: "none",
            order: 1,
            flexGrow: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              padding: "0px",
              gap: "12px",
              width: "96px",
              height: "24px",
              flex: "none",
              order: 0,
              flexGrow: 0,
            }}
          >
            {/* Facebook */}
            <div
              style={{
                width: "24px",
                height: "24px",
                flex: "none",
                order: 0,
                flexGrow: 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "10.94%",
                  right: "10.94%",
                  top: "10.94%",
                  bottom: "10.94%",
                  background: "transparent",
                  width: "19px",
                  height: "19px",
                  display: "none",
                }}
              />
            </div>

            {/* Instagram */}
            <div
              style={{
                width: "24px",
                height: "24px",
                flex: "none",
                order: 1,
                flexGrow: 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "5.4%",
                  right: "5.37%",
                  top: "5.37%",
                  bottom: "5.4%",
                  background: "transparent",
                  width: "21px",
                  height: "21px",
                  display: "none",
                }}
              />
            </div>

            {/* Twitter */}
            <div
              style={{
                width: "24px",
                height: "24px",
                flex: "none",
                order: 2,
                flexGrow: 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "13.33%",
                  right: "13.34%",
                  top: "13.33%",
                  bottom: "13.28%",
                  background: "transparent",
                  width: "18px",
                  height: "18px",
                  display: "none",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}