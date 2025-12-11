import { getBookSlug, parseBookParam } from "@/lib/bookSlugs";
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

  // Don't need query params anymore - we read from path
  // Migrate old param names to new single-letter params, remove defaults
  const query = new URLSearchParams(urlSearchParams as Record<string, string>);
  let needsRedirect = false;

  // Migrate old version params to 'v', remove if default
  if (query.has("bibleVersion") || query.has("version")) {
    const version = query.get("bibleVersion") || query.get("version");
    query.delete("bibleVersion");
    query.delete("version");
    if (version && version !== "NASB1995") {
      query.set("v", version);
    }
    needsRedirect = true;
  }

  // Migrate old type params to 't', remove if default
  if (query.has("explanationType") || query.has("type")) {
    const type = query.get("explanationType") || query.get("type");
    query.delete("explanationType");
    query.delete("type");
    if (type && type !== "summary") {
      query.set("t", type);
    }
    needsRedirect = true;
  }

  if (needsRedirect) {
    const queryString = query.toString();
    redirect(
      `/bible/${bookIdParam}/${chapterNumber}${queryString ? `?${queryString}` : ""}`,
    );
  }

  // If query params exist, this is the main reader page
  const { MainContentWrapper } = await import(
    "./components/MainContentWrapper"
  );

  return (
    <>
      {/* Auto-open handler runs in background on mobile */}
      <AutoOpenHandler bookId={bookId} chapterNumber={chapterNumber} />
      {/* Main Bible reader */}
      <MainContentWrapper />
    </>
  );
}
