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

  for (const row of jsonData.resultset.row) {
    const [id, bookId, chapterId, verseId, text] = row.field;
    let currentBook = booksMap.get(bookId);

    if (!currentBook) {
      const meta = metadataMap.get(bookId);
      if (meta) {
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
    }

    if (currentBook) {
      let currentChapter = currentBook.chapters.find(
        (chap) => chap.chapterId === chapterId,
      );
      if (!currentChapter) {
        currentChapter = { chapterId, verses: [] };
        currentBook.chapters.push(currentChapter);
      }

      currentChapter.verses.push({ verseId, text });
    }
  }

  return bible;
}
