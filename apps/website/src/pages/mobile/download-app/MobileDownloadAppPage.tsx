"use client";

import MobileDownloadApp from "@/sections/mobile/MobileDownloadApp";
import MobileFooter from "@/sections/mobile/MobileFooter";
import MobileHeader from "@/sections/mobile/MobileHeader";

export default function MobileDownloadAppPage() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      <MobileHeader />
      <MobileDownloadApp />
      <MobileFooter />
    </div>
  );
}
