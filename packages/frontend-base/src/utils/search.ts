type Testament = {
  b: number;
  c: number;
  n: string;
  t: string;
  g: number;
};

export const filterBibleBooks = (books: Testament[], searchTerm: string) => {
  if (!searchTerm.trim()) {
    return books;
  }

  const lowercasedFilter = searchTerm.toLowerCase();
  const matches: Testament[] = [];

  for (const book of books) {
    const lowercasedBookName = book.n.toLowerCase();
    const numberedBookMatch = lowercasedBookName.match(/^\d+\s+(.*)/);
    const baseBookName = numberedBookMatch ? numberedBookMatch[1] : null;

    const startsWithFullName = lowercasedBookName.startsWith(lowercasedFilter);
    const startsWithBaseName = baseBookName
      ? baseBookName.startsWith(lowercasedFilter)
      : false;

    if (startsWithFullName || startsWithBaseName) {
      matches.push(book);
    }
  }

  return matches;
};
