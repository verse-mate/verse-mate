"use client";

import MobileAbout1 from "@/sections/mobile/MobileAbout1";
import MobileAbout2 from "@/sections/mobile/MobileAbout2";
import MobileFooter from "@/sections/mobile/MobileFooter";
import MobileGetInvolved from "@/sections/mobile/MobileGetInvolved";
import MobileGlobal from "@/sections/mobile/MobileGlobal";
import MobileHeader from "@/sections/mobile/MobileHeader";
import MobileHero from "@/sections/mobile/MobileHero";
import MobileHowItWorks from "@/sections/mobile/MobileHowItWorks";
import MobileWhyVersemate from "@/sections/mobile/MobileWhyVersemate";

export default function MobileHomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      <MobileHeader />
      <MobileHero />
      <MobileHowItWorks />
      <MobileWhyVersemate />
      <MobileGlobal />
      <MobileGetInvolved />
      <MobileAbout1 />
      <MobileAbout2 />
      <MobileFooter />
    </div>
  );
}
