import Link from "next/link";
import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import { buttonClass } from "@/components/ui/Button";
import { chapterUrl, POPULAR_CHAPTERS } from "@/lib/bible-books";

export default function ReadTheBible() {
  return (
    <Section
      id="read-the-bible"
      className="bg-white"
      containerClassName="flex flex-col items-center gap-10 md:gap-12"
    >
      <div className="flex flex-col items-center gap-4">
        <Eyebrow>READ THE BIBLE</Eyebrow>
        <h2 className="m-0 max-w-[676px] text-center font-merriweather text-section-title text-brand-black">
          Start with a <span className="italic text-brand-tan-hover">chapter.</span>
        </h2>
        <p className="m-0 max-w-[720px] text-center font-inter text-body-lg text-brand-slate">
          Every chapter opens with its text, a summary and a verse-by-verse
          explanation. Free, with no account needed.
        </p>
      </div>

      <ul className="m-0 grid w-full list-none grid-cols-2 gap-3 p-0 sm:gap-4 lg:grid-cols-4">
        {POPULAR_CHAPTERS.map((chapter) => (
          <li key={chapter.label} className="flex">
            <a
              href={chapterUrl(chapter.slug, chapter.chapter)}
              className="flex w-full flex-col gap-1 rounded-2xl border border-brand-line bg-white px-4 py-4 no-underline sm:px-6 sm:py-5 transition-colors duration-200 hover:border-brand-tan-hover hover:bg-brand-light-cream"
            >
              <span className="font-merriweather text-heading-3 text-brand-black">
                {chapter.label}
              </span>
              <span className="font-inter text-body text-brand-slate">
                {chapter.note}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <Link href="/bible/" className={buttonClass({ variant: "dark" })}>
        Browse all 66 books
      </Link>
    </Section>
  );
}
