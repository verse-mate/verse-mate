import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import { BooksOfTheBible } from "@/components/sections/bible/BooksOfTheBible";

export default function Bible() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Books of the Bible — VerseMate"
        description="All 66 books of the Bible, each with its text, a summary and a verse-by-verse explanation on VerseMate. Free, for everyone."
      />
      <Header />

      <main id="main-content" className="flex-1">
        <Section className="bg-light-radial" containerClassName="flex flex-col gap-12 md:gap-16">
          <div className="flex flex-col gap-4">
            <Eyebrow>READ THE BIBLE</Eyebrow>
            <h1 className="m-0 font-merriweather text-section-title text-brand-black">
              Books of the Bible
            </h1>
            <p className="m-0 max-w-[720px] font-inter text-body-lg text-brand-slate">
              Pick a book to see all its chapters, or start reading at its
              first chapter. Every chapter comes with its text, a summary and
              a verse-by-verse explanation.
            </p>
          </div>
          <BooksOfTheBible />
        </Section>
      </main>

      <Footer />
    </div>
  );
}
