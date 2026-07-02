import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import About1 from "@/components/sections/about/About1";
import About2 from "@/components/sections/about/About2";

export default function About() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="About — VerseMate"
        description="VerseMate is a 501(c)(3) nonprofit on a mission to make the Bible easier to understand, study, and love — for everyone, everywhere."
      />
      <Header />
      <main id="main-content" className="flex-1">
        <About1 as="h1" />
        <About2 />
      </main>
      <Footer />
    </div>
  );
}
