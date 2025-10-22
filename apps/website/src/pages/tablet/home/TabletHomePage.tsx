"use client";

import About1 from "@/sections/tablet/About1";
import About2 from "@/sections/tablet/About2";
import Footer from "@/sections/tablet/Footer";
import GetInvolved from "@/sections/tablet/GetInvolved";
import Global from "@/sections/tablet/Global";
import Header from "@/sections/tablet/Header";
import Hero from "@/sections/tablet/Hero";
import HowItWorks from "@/sections/tablet/HowItWorks";
import WhyVersemate from "@/sections/tablet/WhyVersemate";

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
