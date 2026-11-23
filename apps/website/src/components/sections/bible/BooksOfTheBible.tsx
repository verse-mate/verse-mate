import { chapterUrl, TESTAMENTS } from "@/lib/bible-books";

export function BooksOfTheBible() {
  return (
    <div className="flex w-full flex-col gap-12 md:gap-16">
      {TESTAMENTS.map((testament) => (
        <section key={testament.name} className="flex flex-col gap-6">
          <h2 className="m-0 font-merriweather text-section-title text-brand-black">
            {testament.name}
          </h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {testament.books.map((book) => (
              <li key={book.slug}>
                <a
                  href={chapterUrl(book.slug, 1)}
                  className="block rounded-lg py-2 font-inter text-body text-brand-dark-gray underline-offset-4 hover:text-brand-tan-hover hover:underline"
                >
                  {book.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
