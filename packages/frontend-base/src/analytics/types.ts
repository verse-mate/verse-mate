/**
 * Analytics Event Types
 *
 * Type definitions for PostHog analytics events.
 * All event names use UPPER_SNAKE_CASE convention.
 *
 * @see Spec: agent-os/specs/2025-12-15-posthog-product-analytics/spec.md
 */

/**
 * Analytics event names enum
 * Uses UPPER_SNAKE_CASE convention for all event names
 */
export enum AnalyticsEvent {
  // Bible Reading Events
  CHAPTER_VIEWED = "CHAPTER_VIEWED",
  VIEW_MODE_SWITCHED = "VIEW_MODE_SWITCHED", // Not used on web (shows both views), kept for parity
  EXPLANATION_TAB_CHANGED = "EXPLANATION_TAB_CHANGED",

  // Feature Usage Events
  BOOKMARK_ADDED = "BOOKMARK_ADDED",
  BOOKMARK_REMOVED = "BOOKMARK_REMOVED",
  HIGHLIGHT_CREATED = "HIGHLIGHT_CREATED",
  HIGHLIGHT_EDITED = "HIGHLIGHT_EDITED",
  HIGHLIGHT_DELETED = "HIGHLIGHT_DELETED",
  NOTE_CREATED = "NOTE_CREATED",
  NOTE_EDITED = "NOTE_EDITED",
  NOTE_DELETED = "NOTE_DELETED",
  DICTIONARY_LOOKUP = "DICTIONARY_LOOKUP",
  AUTO_HIGHLIGHT_SETTING_CHANGED = "AUTO_HIGHLIGHT_SETTING_CHANGED",
  BIBLE_VERSION_CHANGED = "BIBLE_VERSION_CHANGED",
  CHAPTER_SHARED = "CHAPTER_SHARED",
  TOPIC_SHARED = "TOPIC_SHARED",

  // AI Explanation Events
  VERSEMATE_TOOLTIP_OPENED = "VERSEMATE_TOOLTIP_OPENED",
  AUTO_HIGHLIGHT_TOOLTIP_VIEWED = "AUTO_HIGHLIGHT_TOOLTIP_VIEWED",

  // Authentication Events
  SIGNUP_COMPLETED = "SIGNUP_COMPLETED",
  LOGIN_COMPLETED = "LOGIN_COMPLETED",
  LOGOUT = "LOGOUT",
}

// ============================================================================
// Event Property Interfaces
// ============================================================================

/**
 * Bible Reading Event Properties
 */
export interface ChapterViewedProperties {
  bookId: number;
  chapterNumber: number;
  bibleVersion: string;
}

export interface ViewModeSwitchedProperties {
  mode: "bible" | "explanations";
}

export interface ExplanationTabChangedProperties {
  tab: "summary" | "byline" | "detailed";
}

/**
 * Bookmark Event Properties
 */
export interface BookmarkAddedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
}

export interface BookmarkRemovedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
}

/**
 * Highlight Event Properties
 */
export interface HighlightCreatedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
  highlightColor: string;
}

export interface HighlightEditedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
  previousColor: string;
  newColor: string;
}

export interface HighlightDeletedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
  highlightColor: string;
}

/**
 * Note Event Properties
 * Note: We never track note content for privacy
 */
export interface NoteCreatedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
}

export interface NoteEditedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
}

export interface NoteDeletedProperties {
  bookId: number;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
}

/**
 * Dictionary Event Properties
 */
export interface DictionaryLookupProperties {
  word: string;
  source: string;
  strongsNumber: string;
}

/**
 * Auto-Highlight Setting Event Properties
 */
export interface AutoHighlightSettingChangedProperties {
  themeName: string;
  enabled: boolean;
}

/**
 * Bible Version Change Event Properties
 */
export interface BibleVersionChangedProperties {
  previousVersion: string;
  newVersion: string;
}

/**
 * Share Event Properties
 */
export interface ChapterSharedProperties {
  bookId: number;
  chapterNumber: number;
}

export interface TopicSharedProperties {
  category: string;
  topicSlug: string;
}

/**
 * AI Explanation Event Properties
 */
export interface VersemateTooltipOpenedProperties {
  bookId: number;
  chapterNumber: number;
  verseNumber: number;
}

export interface AutoHighlightTooltipViewedProperties {
  bookId: number;
  chapterNumber: number;
}

/**
 * Authentication Event Properties
 */
export type AuthMethod = "email" | "google" | "apple";

export interface SignupCompletedProperties {
  method: AuthMethod;
}

export interface LoginCompletedProperties {
  method: AuthMethod;
}

// Logout has no properties
export type LogoutProperties = Record<string, never>;

// ============================================================================
// Event Properties Type Map
// ============================================================================

/**
 * Maps each AnalyticsEvent to its corresponding properties type
 * Enables type-safe tracking calls
 */
export interface EventProperties {
  [AnalyticsEvent.CHAPTER_VIEWED]: ChapterViewedProperties;
  [AnalyticsEvent.VIEW_MODE_SWITCHED]: ViewModeSwitchedProperties;
  [AnalyticsEvent.EXPLANATION_TAB_CHANGED]: ExplanationTabChangedProperties;
  [AnalyticsEvent.BOOKMARK_ADDED]: BookmarkAddedProperties;
  [AnalyticsEvent.BOOKMARK_REMOVED]: BookmarkRemovedProperties;
  [AnalyticsEvent.HIGHLIGHT_CREATED]: HighlightCreatedProperties;
  [AnalyticsEvent.HIGHLIGHT_EDITED]: HighlightEditedProperties;
  [AnalyticsEvent.HIGHLIGHT_DELETED]: HighlightDeletedProperties;
  [AnalyticsEvent.NOTE_CREATED]: NoteCreatedProperties;
  [AnalyticsEvent.NOTE_EDITED]: NoteEditedProperties;
  [AnalyticsEvent.NOTE_DELETED]: NoteDeletedProperties;
  [AnalyticsEvent.DICTIONARY_LOOKUP]: DictionaryLookupProperties;
  [AnalyticsEvent.AUTO_HIGHLIGHT_SETTING_CHANGED]: AutoHighlightSettingChangedProperties;
  [AnalyticsEvent.BIBLE_VERSION_CHANGED]: BibleVersionChangedProperties;
  [AnalyticsEvent.CHAPTER_SHARED]: ChapterSharedProperties;
  [AnalyticsEvent.TOPIC_SHARED]: TopicSharedProperties;
  [AnalyticsEvent.VERSEMATE_TOOLTIP_OPENED]: VersemateTooltipOpenedProperties;
  [AnalyticsEvent.AUTO_HIGHLIGHT_TOOLTIP_VIEWED]: AutoHighlightTooltipViewedProperties;
  [AnalyticsEvent.SIGNUP_COMPLETED]: SignupCompletedProperties;
  [AnalyticsEvent.LOGIN_COMPLETED]: LoginCompletedProperties;
  [AnalyticsEvent.LOGOUT]: LogoutProperties;
}

// ============================================================================
// User Properties
// ============================================================================

/**
 * User properties for PostHog identify calls
 * These are person properties that persist across sessions
 */
export interface UserProperties {
  /** User's preferred Bible version (e.g., 'NASB1995', 'KJV') */
  preferred_bible_version?: string;
  /** User's theme preference ('light' | 'dark' | 'auto') */
  theme_preference?: string;
  /** User's language setting from browser locale */
  language_setting?: string;
  /** User's country from browser locale (e.g., 'US', 'BR') */
  country?: string;
  /** Authentication method used ('email' | 'google' | 'apple') */
  account_type?: AuthMethod;
  /** Whether user is registered (false for anonymous, true for logged in) */
  is_registered?: boolean;
  /** Email address (already captured by PostHog identify) */
  email?: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
}
