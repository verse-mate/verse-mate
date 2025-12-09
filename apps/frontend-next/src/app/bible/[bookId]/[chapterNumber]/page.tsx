import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppDetection } from "./components/AppDetection";
import { AppStoreBadges } from "./components/AppStoreBadges";
import { AutoOpenHandler } from "./components/AutoOpenHandler";
import { ChapterPreview } from "./components/ChapterPreview";
import { fetchChapterForPreview } from "./lib/fetchChapterData";
import "./styles.module.css";

interface DeepLinkPageProps {
  params: Promise<{
    bookId: string;
    chapterNumber: string;
  }>;
}

export default async function DeepLinkPage({ params }: DeepLinkPageProps) {
  const { bookId: bookIdStr, chapterNumber: chapterNumberStr } = await params;
  const bookId = Number.parseInt(bookIdStr, 10);
  const chapterNumber = Number.parseInt(chapterNumberStr, 10);

  // Validate parameters
  if (isNaN(bookId) || bookId < 1 || bookId > 66) {
    notFound();
  }
  if (isNaN(chapterNumber) || chapterNumber < 1) {
    notFound();
  }

  // Server-side fetch chapter data
  const { bookName, previewText } = await fetchChapterForPreview(
    bookId,
    chapterNumber,
  );

  return (
    <div className="deep-link-fallback">
      <Suspense fallback={<div>Loading...</div>}>
        <AppDetection />
        <ChapterPreview
          bookId={bookId}
          chapterNumber={chapterNumber}
          bookName={bookName}
          text={previewText}
        />
        <AppStoreBadges />
        <AutoOpenHandler bookId={bookId} chapterNumber={chapterNumber} />
      </Suspense>
    </div>
  );
}
