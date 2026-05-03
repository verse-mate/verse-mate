/**
 * @deprecated D-009 — Q&A feature removed. This hook is a stub kept until
 * the frontend cleanup PR (Epic 12 part 2) removes all callers.
 *
 * Throws at runtime if called. Type signature returns 'any' so existing
 * call sites compile until they're refactored.
 */

const STUB_ERROR =
  "useInput called after Q&A feature removal (D-009). Remove the caller; admin web is read-only Bible preview only.";

// biome-ignore lint/suspicious/noExplicitAny: deprecated stub
export const useInput: any = (..._args: any[]) => {
  throw new Error(STUB_ERROR);
};

// biome-ignore lint/suspicious/noExplicitAny: deprecated stub
export type Message = any;
