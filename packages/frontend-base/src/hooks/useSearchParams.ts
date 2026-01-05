"use client";

import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { useRouter, useSearchParams } from "next/navigation";
import { getBookSlug, parseBookParam } from "../utils/bookSlugs";

export const useSaveSearchParams = () => {
  const router = useRouter();

  const saveSearchParams = ({
    bookId,
    verseId,
    testament,
    conversationId,
    explanationId,
    explanationType,
    bibleVersion,
    showIntro,
    verse,
  }: {
    bookId?: string;
    verseId?: string;
    testament?: "OT" | "NT" | string; // Allow string for "TOPIC" as well
    conversationId?: string;
    explanationId?: string;
    explanationType?: ExplanationTypeEnum;
    bibleVersion?: string;
    showIntro?: boolean;
    verse?: string;
  }) => {
    const searchParams = new URLSearchParams(window.location.search);

    // Only add non-path params to query string
    // bookId, verseId, and testament are in the path for slug URLs
    // Use single letter params for super clean URLs
    // Only include params if they're not the default values
    if (conversationId) searchParams.set("conversationId", conversationId);
    if (explanationId) searchParams.set("explanationId", explanationId);

    if (verse) {
      searchParams.set("verse", verse);
    } else {
      searchParams.delete("verse");
    }

    // Handle explanation type: add if not default, remove if default
    if (explanationType) {
      if (explanationType !== "summary") {
        searchParams.set("t", explanationType);
      } else {
        searchParams.delete("t");
      }
    }

    // Handle bible version: add if not default, remove if default
    if (bibleVersion) {
      if (bibleVersion !== "NASB1995") {
        searchParams.set("v", bibleVersion);
      } else {
        searchParams.delete("v");
      }
    }

    // Handle showIntro parameter
    if (showIntro !== undefined) {
      if (showIntro) {
        searchParams.set("showIntro", "true");
      } else {
        searchParams.delete("showIntro");
      }
    }

    let newUrl: string;
    let shouldUseRouter = false;

    // If navigating to a Bible chapter (not a topic), construct slug URL
    if (bookId && verseId && testament !== "TOPIC") {
      const bookIdNum = Number(bookId);
      const bookSlug = getBookSlug(bookIdNum) || bookId;

      // Build clean URL without redundant params
      const queryString = searchParams.toString();
      newUrl = `/bible/${bookSlug}/${verseId}${queryString ? `?${queryString}` : ""}`;

      // Only use router.push if we're actually changing the book/chapter
      // (not just updating other params like bibleVersion)
      const currentPath = window.location.pathname;
      const targetPath = `/bible/${bookSlug}/${verseId}`;
      shouldUseRouter = currentPath !== targetPath;
    }
    // Topics should never use saveSearchParams - they navigate via router.push() with slug URLs
    // This legacy code path is intentionally removed
    // For root route or other cases, keep current behavior
    else {
      if (bookId) searchParams.set("bookId", bookId);
      if (verseId) searchParams.set("verseId", verseId);
      if (testament) searchParams.set("testament", testament);
      newUrl = `${window.location.pathname}?${searchParams.toString()}`;
    }

    if (shouldUseRouter) {
      // Use Next.js router for actual route changes
      router.push(newUrl);
    } else if (bookId || verseId) {
      // Don't need additional cleanup - searchParams already has the right params
      window.history.pushState({}, "", newUrl);
    } else {
      window.history.replaceState({}, "", newUrl);
    }
  };

  const saveBibleVersionOnURL = (bibleVersion: string) => {
    const searchParams = new URLSearchParams(window.location.search);

    // Use single letter param, only if not default
    if (bibleVersion !== "NASB1995") {
      searchParams.set("v", bibleVersion);
    } else {
      searchParams.delete("v");
    }
    // Remove old param names if they exist
    searchParams.delete("version");
    searchParams.delete("bibleVersion");

    // If we're on a Bible slug route, remove redundant params
    if (typeof window !== "undefined") {
      const pathname = window.location.pathname;
      if (pathname.match(/^\/bible\/[^/]+\/\d+/)) {
        searchParams.delete("bookId");
        searchParams.delete("verseId");
        searchParams.delete("testament");
      }
    }

    const newURL = `${window.location.pathname}?${searchParams.toString()}`;

    window.history.pushState({}, "", newURL);
  };

  return { saveSearchParams, saveBibleVersionOnURL };
};

export const useGetSearchParams = () => {
  const searchParams = useSearchParams();

  // Try to extract bookId and verseId from URL path (for slug routes)
  let bookId: number | string = 1;
  let verseId = 1;
  let testament: TestamentEnum | string = TestamentEnum.OT;
  let isViewingTopic = false;

  if (typeof window !== "undefined") {
    const pathname = window.location.pathname;

    // Check if we're on a Bible slug route: /bible/[slug]/[chapter]
    const bibleRouteMatch = pathname.match(/^\/bible\/([^/]+)\/(\d+)/);
    if (bibleRouteMatch) {
      const [, bookSlugOrId, chapterStr] = bibleRouteMatch;

      // Parse slug or numeric ID
      const parsedBookId = parseBookParam(bookSlugOrId);

      if (parsedBookId) {
        bookId = parsedBookId;
        verseId = Number(chapterStr);
        testament = parsedBookId <= 39 ? TestamentEnum.OT : TestamentEnum.NT;
      }
    }
    // Check if we're on a topic slug route: /topic/[category]/[slug]
    else if (pathname.match(/^\/topic\/[^/]+\/[^/]+/)) {
      // For topics on slug routes, get data from window.__TOPIC_DATA__
      // This is set by TopicProvider in the topic page component
      if ((window as any).__TOPIC_DATA__) {
        const topicData = (window as any).__TOPIC_DATA__;
        testament = "TOPIC";
        isViewingTopic = true;
        bookId = topicData.category;
        verseId = topicData.sortOrder;
      } else {
        // If no topic data available, use defaults
        // (This shouldn't happen in normal flow, but prevents crashes)
        testament = "TOPIC";
        isViewingTopic = true;
        bookId = "";
        verseId = 1;
      }
    }
    // Otherwise, check query params (for root route)
    else {
      const testamentParam = searchParams?.get("testament") as TestamentEnum;
      testament = testamentParam || TestamentEnum.OT;
      isViewingTopic = (testament as unknown as string) === "TOPIC";

      const bookIdParam = searchParams?.get("bookId");
      bookId = isViewingTopic ? bookIdParam || "" : Number(bookIdParam) || 1;
      verseId = Number(searchParams?.get("verseId")) || 1;
    }
  } else {
    // SSR fallback - try to read from query params
    const testamentParam = searchParams?.get("testament") as TestamentEnum;
    testament = testamentParam || TestamentEnum.OT;
    isViewingTopic = (testament as unknown as string) === "TOPIC";

    const bookIdParam = searchParams?.get("bookId");
    bookId = isViewingTopic ? bookIdParam || "" : Number(bookIdParam) || 1;
    verseId = Number(searchParams?.get("verseId")) || 1;
  }

  // Read from single letter params, fallback to old names for backwards compatibility
  const bibleVersion =
    searchParams?.get("v") ||
    searchParams?.get("version") ||
    searchParams?.get("bibleVersion") ||
    "NASB1995";
  const conversationId = searchParams?.get("conversationId") || "newChat";
  const explanationId = Number(searchParams?.get("explanationId"));
  const explanationType =
    (searchParams?.get("t") as ExplanationTypeEnum) ||
    (searchParams?.get("type") as ExplanationTypeEnum) ||
    (searchParams?.get("explanationType") as ExplanationTypeEnum) ||
    ExplanationTypeEnum.summary;
  const showIntro = searchParams?.get("showIntro") === "true";
  const verse = searchParams?.get("verse");

  return {
    bookId,
    verseId,
    testament,
    bibleVersion,
    conversationId,
    explanationId,
    explanationType,
    isViewingTopic,
    showIntro,
    verse,
    // chapters is intentionally omitted here
  };
};
