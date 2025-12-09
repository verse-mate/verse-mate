"use client";

import { MainPage } from "frontend-base";
import { useEffect } from "react";
import { useTopicData } from "./TopicProvider";

export function TopicContentWrapper() {
  const topicData = useTopicData();

  // Set topic data globally BEFORE render
  if (typeof window !== "undefined") {
    (window as any).__TOPIC_DATA__ = topicData;
  }

  // Also add minimal query params for backward compatibility
  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentParams = new URLSearchParams(window.location.search);
      const needsParams =
        currentParams.get("testament") !== "TOPIC" ||
        currentParams.get("bookId") !== topicData.category ||
        currentParams.get("verseId") !== String(topicData.sortOrder);

      if (needsParams) {
        const newParams = new URLSearchParams(currentParams);
        newParams.set("testament", "TOPIC");
        newParams.set("bookId", topicData.category);
        newParams.set("verseId", String(topicData.sortOrder));

        const pathname = window.location.pathname;
        const newUrl = `${pathname}?${newParams.toString()}`;

        // Use replaceState to avoid adding to history
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, [topicData]);

  return <MainPage.MainContent />;
}
