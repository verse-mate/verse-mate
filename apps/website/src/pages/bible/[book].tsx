import type { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Section from "@/components/ui/Section";
import Eyebrow from "@/components/ui/Eyebrow";
import {
  bookBySlug,
  bookMeta,
  bookPath,
  BOOKS,
  chapterUrl,
  neighbours,
} from "@/lib/bible-books";

type BookPageProps = { slug: string };

const NAV_LINK_CLASS =
  "font-inter text-body text-brand-dark-gray underline-offset-4 hover:text-brand-tan-hover hover:underline";

export default function BookPage({ slug }: BookPageProps) {
  const book = bookBySlug(slug);
  if (!book) return null;
  const { previous, next } = neighbours(slug);
  const { title, description } = bookMeta(book);
  const chapters = Array.from({ length: book.chapters }, (_, index) => index + 1);

  return (
    <div className="flex min-h-screen flex-col">
      <Seo title={title} description={description} />
      <Header />

      <main id="main-content" className="flex-1">
        <Section className="bg-light-radial" containerClassName="flex flex-col gap-12 md:gap-16">
          <div className="flex flex-col gap-4">
            <Eyebrow>{book.testament}</Eyebrow>
            <h1 className="m-0 font-merriweather text-section-title text-brand-black">
              {book.name}
            </h1>
            <p className="m-0 max-w-[720px] font-inter text-body-lg text-brand-slate">
              {book.paragraph}
            </p>
          </div>

          <section className="flex flex-col gap-6">
            <h2 className="m-0 font-merriweather text-section-title text-brand-black">
              {book.chapters === 1 ? "Chapter" : "Chapters"}
            </h2>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {chapters.map((chapter) => (
                <li key={chapter}>
                  <a
                    href={chapterUrl(book.slug, chapter)}
                    className="block rounded-lg py-2 font-inter text-body text-brand-dark-gray underline-offset-4 hover:text-brand-tan-hover hover:underline"
                  >
                    {book.name} {chapter}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <nav
            aria-label="Books of the Bible"
            className="flex flex-col gap-3 border-t border-brand-dark-gray/10 pt-8 sm:flex-row sm:flex-wrap sm:gap-x-8"
          >
            {previous ? (
              <Link href={bookPath(previous.slug)} className={NAV_LINK_CLASS}>
                Previous book: {previous.name}
              </Link>
            ) : null}
            {next ? (
              <Link href={bookPath(next.slug)} className={NAV_LINK_CLASS}>
                Next book: {next.name}
              </Link>
            ) : null}
            <Link href="/bible/" className={NAV_LINK_CLASS}>
              All books of the Bible
            </Link>
          </nav>
        </Section>
      </main>

      <Footer />
    </div>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: BOOKS.map((book) => ({ params: { book: book.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<BookPageProps> = async ({ params }) => {
  const slug = String(params?.book ?? "");
  if (!bookBySlug(slug)) return { notFound: true };
  return { props: { slug } };
};
