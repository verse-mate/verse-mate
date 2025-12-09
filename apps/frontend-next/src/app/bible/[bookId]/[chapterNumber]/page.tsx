import { getBookSlug, parseBookParam } from "frontend-base";
import { notFound, redirect } from "next/navigation";
import { AutoOpenHandler } from "./components/AutoOpenHandler";

interface DeepLinkPageProps {
  params: Promise<{
    bookId: string;
    chapterNumber: string;
  }>;
}

export default async function DeepLinkPage({
  params,
  searchParams,
}: DeepLinkPageProps & {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bookId: bookIdParam, chapterNumber: chapterNumberStr } = await params;
  const urlSearchParams = await searchParams;

  // Parse bookId (accepts both numeric IDs and slugs)
  const bookId = parseBookParam(bookIdParam);
  const chapterNumber = Number.parseInt(chapterNumberStr, 10);

  // Validate parameters
  if (!bookId || bookId < 1 || bookId > 66) {
    notFound();
  }
  if (Number.isNaN(chapterNumber) || chapterNumber < 1) {
    notFound();
  }

  // Redirect numeric URLs to slug URLs for SEO
  const isNumericUrl = /^\d+$/.test(bookIdParam);
  if (isNumericUrl) {
    const slug = getBookSlug(bookId);
    if (slug) {
      // Preserve existing search params in redirect
      const query = new URLSearchParams(
        urlSearchParams as Record<string, string>,
      );
      const queryString = query.toString();
      redirect(
        `/bible/${slug}/${chapterNumber}${queryString ? `?${queryString}` : ""}`,
      );
    }
  }

  // If query params are missing, redirect to initialize them
  if (!urlSearchParams.bookId || !urlSearchParams.verseId) {
    const testament = bookId <= 39 ? "OT" : "NT";
    const query = new URLSearchParams(
      urlSearchParams as Record<string, string>,
    );
    query.set("bookId", bookId.toString());
    query.set("verseId", chapterNumber.toString());
    query.set("testament", testament);
    if (!query.has("bibleVersion")) {
      query.set("bibleVersion", "NASB1995");
    }
    redirect(`/bible/${bookIdParam}/${chapterNumber}?${query.toString()}`);
  }

  // If query params exist, this is the main reader page
  // Import MainContent dynamically to avoid SSR issues
  const { MainPage } = await import("frontend-base");

  return (
    <>
      {/* Auto-open handler runs in background on mobile */}
      <AutoOpenHandler bookId={bookId} chapterNumber={chapterNumber} />
      {/* Main Bible reader */}
      <MainPage.MainContent />
    </>
  );
}
