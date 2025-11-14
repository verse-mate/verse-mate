import type { HighlightColor } from "../../../HighlightColorPicker/types";

export type Verse = {
  verseNumber: number;
  text: string;
};

export type Subtitle = {
  subtitle: string;
  start_verse: number;
  end_verse: number;
};

export type Chapter = {
  chapterNumber: number;
  subtitles: Subtitle[];
  verses: Verse[];
};

export type Highlight = {
  highlight_id: number;
  user_id: string;
  chapter_id: number;
  start_verse: number;
  end_verse: number;
  start_char?: number;
  end_char?: number;
  selected_text?: string;
  color: HighlightColor;
  created_at: string;
  updated_at: string;
};

export type AutoHighlight = {
  auto_highlight_id: number;
  theme_id: number;
  theme_name: string;
  theme_color: string;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  relevance_score: number;
  created_at: string;
};

export interface TextProps {
  text: Chapter;
  bookName: string;
  testament?: "OT" | "NT";
  bookId?: number;
  chapterId?: number;
  highlights?: Highlight[];
  onHighlightCreate?: (
    startVerse: number,
    endVerse: number,
    color: HighlightColor,
    startChar?: number,
    endChar?: number,
    selectedText?: string,
  ) => Promise<void>;
  onHighlightDelete?: (highlightId: number) => Promise<void>;
  onHighlightUpdate?: (
    highlightId: number,
    color: HighlightColor,
  ) => Promise<void>;
}
