"use client";

import { MainPage } from "frontend-base";
import { useTopicData } from "./TopicProvider";

export function TopicContentWrapper() {
  const topicData = useTopicData();

  // Set topic data globally for useGetSearchParams to access
  // This provides topic context (category, sortOrder) without query params
  if (typeof window !== "undefined") {
    (window as any).__TOPIC_DATA__ = topicData;
  }

  return <MainPage.MainContent />;
}
