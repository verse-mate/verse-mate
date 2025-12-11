"use client";

import { type ReactNode, createContext, useContext } from "react";

interface TopicData {
  category: string; // Backend category: EVENT, PROPHECY, etc.
  sortOrder: number;
  topicId: string;
  topicName: string;
}

const TopicContext = createContext<TopicData | null>(null);

export function TopicProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: TopicData;
}) {
  return (
    <TopicContext.Provider value={value}>{children}</TopicContext.Provider>
  );
}

export function useTopicData() {
  const context = useContext(TopicContext);
  if (!context) {
    throw new Error("useTopicData must be used within TopicProvider");
  }
  return context;
}
