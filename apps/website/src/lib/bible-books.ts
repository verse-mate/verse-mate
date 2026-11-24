import generated from "./bible-books.generated.json";

export const READER_ORIGIN = "https://app.versemate.org";

export interface BibleBook {
  name: string;
  slug: string;
  testament: "Old Testament" | "New Testament";
  chapters: number;
  paragraph: string;
}

const TESTAMENT_NAMES = { OT: "Old Testament", NT: "New Testament" } as const;

export const BOOKS: BibleBook[] = generated.map((book) => ({
  name: book.name,
  slug: book.slug,
  testament: TESTAMENT_NAMES[book.testament as keyof typeof TESTAMENT_NAMES],
  chapters: book.chapters,
  paragraph: book.paragraph,
}));

export const TESTAMENTS = Object.values(TESTAMENT_NAMES).map((name) => ({
  name,
  books: BOOKS.filter((book) => book.testament === name),
}));

export const bookBySlug = (slug: string) =>
  BOOKS.find((book) => book.slug === slug);

export const neighbours = (slug: string) => {
  const index = BOOKS.findIndex((book) => book.slug === slug);
  return {
    previous: index > 0 ? BOOKS[index - 1] : undefined,
    next: index >= 0 && index < BOOKS.length - 1 ? BOOKS[index + 1] : undefined,
  };
};

export const bookPath = (slug: string) => `/bible/${slug}/`;

export const chapterUrl = (slug: string, chapter: number) =>
  `${READER_ORIGIN}/bible/${slug}/${chapter}`;

export const POPULAR_CHAPTERS = [
  { label: "Genesis 1", slug: "genesis", chapter: 1, note: "In the beginning" },
  { label: "Psalm 23", slug: "psalms", chapter: 23, note: "The Lord is my shepherd" },
  { label: "Proverbs 3", slug: "proverbs", chapter: 3, note: "Trust in the Lord" },
  { label: "Isaiah 53", slug: "isaiah", chapter: 53, note: "The suffering servant" },
  { label: "Matthew 5", slug: "matthew", chapter: 5, note: "The Sermon on the Mount" },
  { label: "John 3", slug: "john", chapter: 3, note: "For God so loved the world" },
  { label: "Romans 8", slug: "romans", chapter: 8, note: "No condemnation" },
  { label: "1 Corinthians 13", slug: "1-corinthians", chapter: 13, note: "Love is patient" },
];
