"use client";

import About1 from "@/sections/desktop/About1";
import About2 from "@/sections/desktop/About2";
import Footer from "@/sections/desktop/Footer";
import GetInvolved from "@/sections/desktop/GetInvolved";
import Global from "@/sections/desktop/Global";
import Header from "@/sections/desktop/Header";
import Hero from "@/sections/desktop/Hero";
import HowItWorks from "@/sections/desktop/HowItWorks";
import WhyVersemate from "@/sections/desktop/WhyVersemate";

export default function TabletHomePage() {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <HowItWorks />
      <WhyVersemate />
      <Global />
      <GetInvolved />
      <About1 />
      <About2 />
      <Footer />
    </div>
  );
}
