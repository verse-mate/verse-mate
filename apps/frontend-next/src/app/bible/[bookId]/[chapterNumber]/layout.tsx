import type { Metadata } from "next";
import { fetchChapterForPreview } from "./lib/fetchChapterData";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ bookId: string; chapterNumber: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string; chapterNumber: string }>;
}): Promise<Metadata> {
  const { bookId: bookIdStr, chapterNumber: chapterNumberStr } = await params;
  const bookId = Number.parseInt(bookIdStr, 10);
  const chapterNumber = Number.parseInt(chapterNumberStr, 10);
  const { bookName } = await fetchChapterForPreview(bookId, chapterNumber);

  return {
    title: `${bookName} ${chapterNumber} - VerseMate`,
    description: `Read ${bookName} chapter ${chapterNumber} on VerseMate - Bible reading with AI-powered explanations`,
    openGraph: {
      title: `${bookName} ${chapterNumber}`,
      description: "Read this chapter on VerseMate",
      url: `https://app.versemate.org/bible/${bookId}/${chapterNumber}`,
      type: "article",
    },
  };
}

export default function DeepLinkLayout({ children }: LayoutProps) {
  return <>{children}</>;
}
