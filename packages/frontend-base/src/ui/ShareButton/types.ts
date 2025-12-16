export type ShareButtonProps = {
  url: string;
  title?: string;
  text?: string;
  className?: string;
  variant?: "icon" | "button";
  /** Analytics context - use 'chapter' for Bible chapters or 'topic' for topic pages */
  analyticsContext?: {
    type: "chapter" | "topic";
    /** For chapter: bookId number. For topic: category string */
    bookIdOrCategory: number | string;
    /** For chapter: chapterNumber. For topic: topicSlug */
    chapterOrSlug: number | string;
  };
};
