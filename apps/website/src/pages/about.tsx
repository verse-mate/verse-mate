import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import About1 from "@/components/sections/about/About1";
import About2 from "@/components/sections/about/About2";

export default function About() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <About1 />
        <About2 />
      </main>
      <Footer />
    </div>
  );
}
