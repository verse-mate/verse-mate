"use client";

import DownloadApp from "@/sections/tablet/DownloadApp";
import Footer from "@/sections/tablet/Footer";
import Header from "@/sections/tablet/Header";

export default function TabletDownloadAppPage() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      <Header />
      <DownloadApp />
      <Footer />
    </div>
  );
}
