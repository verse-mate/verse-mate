"use client";

import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { useSearchParams } from "next/navigation";
import { useNavigate } from "react-router-dom";

export const useSaveSearchParams = () => {
  const navigate = useNavigate();
  const saveSearchParams = ({
    bookId,
    verseId,
    testament,
    conversationId,
    explanationId,
    explanationType,
    bibleVersion,
  }: {
    bookId?: string;
    verseId?: string;
    testament?: TestamentEnum;
    conversationId?: string;
    explanationId?: string;
    explanationType?: ExplanationTypeEnum;
    bibleVersion?: string;
  }) => {
    const searchParams = new URLSearchParams(window.location.search);

    if (bookId) searchParams.set("bookId", bookId);
    if (verseId) searchParams.set("verseId", verseId);
    if (testament) searchParams.set("testament", testament);
    if (conversationId) searchParams.set("conversationId", conversationId);
    if (explanationId) searchParams.set("explanationId", explanationId);
    if (explanationType) searchParams.set("explanationType", explanationType);
    if (bibleVersion) searchParams.set("explanationType", bibleVersion);

    const newUrl = `${window.location.pathname}?${searchParams.toString()}`;

    navigate(newUrl, { replace: true });
  };

  const saveBibleVersionOnURL = (bibleVersion: string) => {
    const searchParams = new URLSearchParams(window.location.search);

    searchParams.set("bibleVersion", bibleVersion);

    const newURL = `${window.location.pathname}?${searchParams.toString()}`;

    window.history.replaceState({}, "", newURL);
  };

  return { saveSearchParams, saveBibleVersionOnURL };
};

export const useGetSearchParams = () => {
  const searchParams = useSearchParams();
  const bookId = Number(searchParams.get("bookId")) || 40;
  const verseId = Number(searchParams.get("verseId")) || 1;
  const testament =
    (searchParams.get("testament") as TestamentEnum) || TestamentEnum.NT;
  const bibleVersion = searchParams.get("bibleVersion") || "NASB1995";
  const conversationId = searchParams.get("conversationId") || "newChat";
  const explanationId = Number(searchParams.get("explanationId"));
  const explanationType =
    searchParams.get("explanationType") || ExplanationTypeEnum.summary;

  return {
    bookId,
    verseId,
    testament,
    bibleVersion,
    conversationId,
    explanationId,
    explanationType,
  };
};
