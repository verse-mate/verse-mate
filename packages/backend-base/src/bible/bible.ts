import type { BunFile } from "bun";

const genres: Genre[] = [
  { g: 1, n: "Law" },
  { g: 2, n: "History" },
  { g: 3, n: "Wisdom" },
  { g: 4, n: "Prophets" },
  { g: 5, n: "Gospels" },
  { g: 6, n: "Acts" },
  { g: 7, n: "Epistles" },
  { g: 8, n: "Apocalyptic" },
];

async function loadBookMetadata(
  bunFile: BunFile,
): Promise<Map<number, BookMeta>> {
  const jsonData = await bunFile.json();
  const metadataMap: Map<number, BookMeta> = new Map();

  for (const key of jsonData.resultset.keys) {
    const genre = genres.find((genre) => genre.g === key.g);
    if (genre) {
      metadataMap.set(key.b, {
        bookId: key.b,
        chaptersCount: key.c,
        name: key.n,
        testament: key.t as Testament,
        genre,
      });
    }
  }

  return metadataMap;
}

export async function parseBibleData(
  file: BunFile,
  metadataFile: BunFile,
): Promise<Bible> {
  const metadataMap = await loadBookMetadata(metadataFile);
  const jsonData = await file.json();
  const bible: Bible = { books: [] };
  const booksMap: Map<number, Book> = new Map();

  for (const [bookName, chapters] of Object.entries(jsonData.resultset)) {
    const bookId = getBookIdByName(bookName);
    const meta = metadataMap.get(bookId);

    if (meta) {
      let currentBook = booksMap.get(bookId);
      if (!currentBook) {
        currentBook = {
          bookId,
          name: meta.name,
          testament: meta.testament,
          genre: meta.genre,
          chapters: [],
        };
        booksMap.set(bookId, currentBook);
        bible.books.push(currentBook);
      }

      for (const [chapterNumber, chapterData] of Object.entries(
        chapters as Record<string, any>,
      )) {
        let currentChapter = currentBook.chapters.find(
          (chap) => chap.chapterId === Number(chapterNumber),
        );
        if (!currentChapter) {
          currentChapter = {
            chapterId: Number(chapterNumber),
            subtitles: [],
            verses: [],
          };
          currentBook.chapters.push(currentChapter);
        }

        const subtitles = chapterData.subtitles || [];

        const verses = Object.entries(chapterData)
          .filter(([key]) => key !== "subtitles")
          .map(([verseId, text]) => ({
            verseId: Number(verseId),
            text: text as string,
          }));

        currentChapter.verses.push(...verses);

        currentChapter.subtitles.push(...subtitles);
      }
    }
  }

  return bible;
}

function getBookIdByName(bookName: string): number {
  const bookMap: { [key: string]: number } = {
    Genesis: 1,
    Exodus: 2,
    Leviticus: 3,
    Numbers: 4,
    Deuteronomy: 5,
    Joshua: 6,
    Judges: 7,
    Ruth: 8,
    "1 Samuel": 9,
    "2 Samuel": 10,
    "1 Kings": 11,
    "2 Kings": 12,
    "1 Chronicles": 13,
    "2 Chronicles": 14,
    Ezra: 15,
    Nehemiah: 16,
    Esther: 17,
    Job: 18,
    Psalms: 19,
    Proverbs: 20,
    Ecclesiastes: 21,
    "Song of Solomon": 22,
    Isaiah: 23,
    Jeremiah: 24,
    Lamentations: 25,
    Ezekiel: 26,
    Daniel: 27,
    Hosea: 28,
    Joel: 29,
    Amos: 30,
    Obadiah: 31,
    Jonah: 32,
    Micah: 33,
    Nahum: 34,
    Habakkuk: 35,
    Zephaniah: 36,
    Haggai: 37,
    Zechariah: 38,
    Malachi: 39,
    Matthew: 40,
    Mark: 41,
    Luke: 42,
    John: 43,
    Acts: 44,
    Romans: 45,
    "1 Corinthians": 46,
    "2 Corinthians": 47,
    Galatians: 48,
    Ephesians: 49,
    Philippians: 50,
    Colossians: 51,
    "1 Thessalonians": 52,
    "2 Thessalonians": 53,
    "1 Timothy": 54,
    "2 Timothy": 55,
    Titus: 56,
    Philemon: 57,
    Hebrews: 58,
    James: 59,
    "1 Peter": 60,
    "2 Peter": 61,
    "1 John": 62,
    "2 John": 63,
    "3 John": 64,
    Jude: 65,
    Revelation: 66,
  };

  return bookMap[bookName] || -1;
}
