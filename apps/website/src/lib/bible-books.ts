export const READER_ORIGIN = "https://app.versemate.org";

const OLD_TESTAMENT = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
];

const NEW_TESTAMENT = [
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

export interface BibleBook {
  name: string;
  slug: string;
}

const book = (name: string): BibleBook => ({
  name,
  slug: name.toLowerCase().replace(/ /g, "-"),
});

export const TESTAMENTS = [
  { name: "Old Testament", books: OLD_TESTAMENT.map(book) },
  { name: "New Testament", books: NEW_TESTAMENT.map(book) },
];

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
