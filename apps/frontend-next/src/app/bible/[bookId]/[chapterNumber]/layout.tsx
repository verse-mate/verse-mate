import { getBookSlug, parseBookParam } from "@/lib/bookSlugs";
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
  const { bookId: bookIdParam, chapterNumber: chapterNumberStr } = await params;

  // Parse bookId (accepts both numeric IDs and slugs)
  const bookId = parseBookParam(bookIdParam);
  const chapterNumber = Number.parseInt(chapterNumberStr, 10);

  if (!bookId) {
    return {
      title: "Chapter Not Found - VerseMate",
      description: "The requested chapter could not be found",
    };
  }

  const { bookName } = await fetchChapterForPreview(bookId, chapterNumber);

  // Get slug for canonical URL (always use slug in metadata)
  const bookSlug = getBookSlug(bookId) || bookId.toString();

  return {
    title: `${bookName} ${chapterNumber} - VerseMate`,
    description: `Read ${bookName} chapter ${chapterNumber} on VerseMate - Bible reading with AI-powered explanations`,
    openGraph: {
      title: `${bookName} ${chapterNumber}`,
      description: "Read this chapter on VerseMate",
      url: `https://app.versemate.org/bible/${bookSlug}/${chapterNumber}`,
      type: "article",
      images: [
        {
          url: "https://app.versemate.org/app-icon.png",
          width: 1024,
          height: 1024,
          alt: "VerseMate",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: `${bookName} ${chapterNumber}`,
      description: "Read this chapter on VerseMate",
      images: ["https://app.versemate.org/app-icon.png"],
    },
  };
}

export default function DeepLinkLayout({ children }: LayoutProps) {
  return <>{children}</>;
}
