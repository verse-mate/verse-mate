export async function fetchChapterForPreview(
  bookId: number,
  chapterNumber: number,
) {
  const apiUrl = process.env.API_URL || "https://api.versemate.org";

  try {
    const response = await fetch(
      `${apiUrl}/bible/book/${bookId}/${chapterNumber}?versionKey=NASB1995`,
      { next: { revalidate: 3600 } }, // Cache for 1 hour
    );

    if (!response.ok) throw new Error("Failed to fetch chapter");

    const data = await response.json();
    const bookName = data.book?.name || "Unknown";
    const verses = data.book?.chapters?.[0]?.verses || [];
    const previewText = verses
      .slice(0, 3) // First 3 verses
      .map((v: any) => v.text)
      .join(" ")
      .substring(0, 200);

    return { bookName, previewText };
  } catch (error) {
    console.error("Error fetching chapter:", error);
    return { bookName: "Bible Chapter", previewText: "" };
  }
}
