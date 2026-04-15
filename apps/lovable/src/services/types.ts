// VerseMate domain types — aligned to the real API (api.versemate.org)
// plus backward-compat fields so existing UI code keeps working unchanged.

export type BibleVersion = 'ESV' | 'NIV' | 'KJV' | 'NLT';

export interface Verse {
  number: number; // mirrors API verseNumber
  text: string;
}

export interface ChapterSubtitle {
  subtitle: string;
  start_verse: number;
  end_verse: number;
}

export interface Chapter {
  book: string; // display name
  bookId: number; // API numeric id
  chapter: number;
  verses: Verse[];
  subtitles?: ChapterSubtitle[];
}

export interface BibleBook {
  bookId: number;
  name: string;
  shortName: string;
  testament: 'OT' | 'NT';
  chapters: number; // count
}

export interface Bookmark {
  id: string;
  favoriteId?: number;
  bookId: number;
  book: string;
  chapter: number;
  verse?: number;
  version: BibleVersion;
  createdAt: string;
}

export interface Note {
  id: string;
  bookId: number;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type HighlightColor =
  | 'yellow'
  | 'green'
  | 'blue'
  | 'pink'
  | 'purple'
  | 'orange'
  | 'red'
  | 'teal'
  | 'brown';

export interface Highlight {
  id: string;
  highlightId?: number;
  bookId: number;
  book: string;
  chapter: number;
  verse: number; // start_verse (for single-verse UI)
  startVerse?: number;
  endVerse?: number;
  startChar?: number | null;
  endChar?: number | null;
  color: HighlightColor;
  createdAt: string;
}

export type ExplanationType = 'summary' | 'byline' | 'detailed';

export interface Commentary {
  verse: number; // 0 for chapter-level, specific verse for byline
  summary: string;
  detail: string;
  type?: ExplanationType;
}

export interface VerseInsight {
  verse: number;
  crossReferences: string[];
  originalLanguage: string;
  historicalContext: string;
}

export type TopicCategory = 'EVENT' | 'PARABLE' | 'PROPHECY' | 'THEME';

export interface Topic {
  id: string; // UUID
  name: string;
  description: string;
  category?: TopicCategory | string;
  slug?: string;
  icon?: string;
}

export interface TopicEvent {
  id: string;
  topicId: string;
  title: string;
  description: string;
  references: string[];
}

export interface MostQuotedVerse {
  reference: string;
  book: string;
  bookId?: number;
  chapter: number;
  verse: number;
  text: string;
  quoteCount: number;
}
