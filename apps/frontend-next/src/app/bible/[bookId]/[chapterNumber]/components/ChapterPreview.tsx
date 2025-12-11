"use client";

interface ChapterPreviewProps {
  bookId: number;
  chapterNumber: number;
  bookName: string;
  text: string;
}

export function ChapterPreview({
  chapterNumber,
  bookName,
  text,
}: Omit<ChapterPreviewProps, "bookId">) {
  return (
    <div className="chapter-preview-card">
      <h1 className="chapter-title">
        {bookName} {chapterNumber}
      </h1>
      <p className="chapter-text">
        {text}
        {text.length >= 200 && "..."}
      </p>
    </div>
  );
}
