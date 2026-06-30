import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/home/Hero";
import HowItWorks from "@/components/sections/home/HowItWorks";
import WhyVersemate from "@/components/sections/home/WhyVersemate";
import Global from "@/components/sections/home/Global";
import GetInvolved from "@/components/sections/home/GetInvolved";
import About1 from "@/components/sections/about/About1";
import About2 from "@/components/sections/about/About2";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="VerseMate — Understand God's Word"
        description="VerseMate helps anyone, anywhere connect with God's Word clearly — with summary, line-by-line, and in-depth study. Always free, for everyone, forever."
      />
      <Header />
      <main id="main-content" className="flex-1">
        <Hero />
        <HowItWorks />
        <WhyVersemate />
        <Global />
        <GetInvolved />
        <About1 />
        <About2 />
      </main>
      <Footer />
    </div>
  );
}
