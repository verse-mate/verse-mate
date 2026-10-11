const GUEST_BOOK_ID = 1;
const GUEST_CHAPTER_NUMBER = 1;

export function isGuestAudioChapter(
  bookId: number | undefined,
  chapterNumber: number | undefined,
): boolean {
  return bookId === GUEST_BOOK_ID && chapterNumber === GUEST_CHAPTER_NUMBER;
}
