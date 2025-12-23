/**
 * Analytics Module
 *
 * Provides type-safe analytics tracking for VerseMate web application.
 *
 * @example
 * ```ts
 * import { analytics, AnalyticsEvent } from '../analytics';
 *
 * // Track an event
 * analytics.track(AnalyticsEvent.CHAPTER_VIEWED, {
 *   bookId: 1,
 *   chapterNumber: 1,
 *   bibleVersion: 'NASB1995'
 * });
 *
 * // Identify a user
 * analytics.identify('user-123', {
 *   email: 'user@example.com',
 *   account_type: 'email'
 * });
 *
 * // Capture an exception
 * analytics.captureException(error, {
 *   source: 'error-boundary',
 *   pathname: '/bible/genesis/1'
 * });
 * ```
 */

export { analytics } from "./analytics";
export { AnalyticsEvent } from "./types";

// Error tracking exports
export {
  shouldExcludeError,
  collectErrorContext,
  extractErrorDetails,
  isOffline,
} from "./error-filters";
export type { ExceptionContext } from "./error-filters";

export type {
  // Event Properties
  EventProperties,
  ChapterViewedProperties,
  ViewModeSwitchedProperties,
  ExplanationTabChangedProperties,
  BookmarkAddedProperties,
  BookmarkRemovedProperties,
  HighlightCreatedProperties,
  HighlightEditedProperties,
  HighlightDeletedProperties,
  NoteCreatedProperties,
  NoteEditedProperties,
  NoteDeletedProperties,
  DictionaryLookupProperties,
  AutoHighlightSettingChangedProperties,
  ChapterSharedProperties,
  TopicSharedProperties,
  VersemateTooltipOpenedProperties,
  AutoHighlightTooltipViewedProperties,
  SignupCompletedProperties,
  LoginCompletedProperties,
  LogoutProperties,
  // User Properties
  UserProperties,
  AuthMethod,
} from "./types";
