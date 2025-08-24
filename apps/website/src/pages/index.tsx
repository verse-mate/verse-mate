import Footer from "@/components/Footer";
import Header from "@/components/Header";
import About1 from "@/sections/About1";
import About2 from "@/sections/About2";
import GetInvolved from "@/sections/GetInvolved";
import Global from "@/sections/Global";
import Hero from "@/sections/Hero";
import HowItWorks from "@/sections/HowItWorks";
import WhyVersemate from "@/sections/WhyVersemate";

export default function Home() {
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
