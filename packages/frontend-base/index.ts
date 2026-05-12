/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

"use client";

/**
 * `frontend-base` root entry point.
 *
 * **VERA-18 / VERA-20 carve-out in progress.**
 *
 * Admin consumers must migrate to `frontend-base/admin` (or `frontend-base/admin/*`).
 * The end-user surfaces below remain re-exported only so `apps/frontend-next`
 * end-user routes continue to build until VERA-21 (T4) strips them. They are
 * marked `@deprecated` and will be removed once `apps/frontend-next` is
 * admin-only and no other consumer remains.
 */

// -------- Shared primitives (kept; safe for both surfaces) --------

export { Notifications, notify } from "./src/notification";
export { Alert } from "./src/ui/Alert/Alert";
export * from "./src/ui/Avatar";
export { Button } from "./src/ui/Button/Button";
export { Checkbox } from "./src/ui/Checkbox/Checkbox";
export {
  CheckboxList,
  type CheckboxListProps,
} from "./src/ui/CheckboxList/CheckboxList";
export { Combobox, type ComboboxProps } from "./src/ui/ComboBox/Combobox";
export { Container } from "./src/ui/Container/Container";
export {
  CookieConsent,
  CONSENT_STORAGE_KEY,
  CONSENT_ACKNOWLEDGED,
  type CookieConsentProps,
} from "./src/ui/CookieConsent";
export * from "./src/ui/Dialog";
export * from "./src/ui/Icons";
export { Input } from "./src/ui/Input";
export { Legend } from "./src/ui/Legend/Legend";
export { Link } from "./src/ui/Link";
export { Table, type TableProps } from "./src/ui/Table";
export { Text } from "./src/ui/Text/Text";
export { Tooltip } from "./src/ui/Tooltip/Tooltip";
export * from "./src/utils/auth-utils";
export { safePromise } from "./src/utils/safe-promise";
export { Accordion } from "./src/ui/Accordion";
export { Popover } from "./src/ui/Popover";
export { NotFound } from "./src/not-found";

// -------- Admin surfaces (use `frontend-base/admin` going forward) --------

export { AdminDashboard } from "./src/ui/admin/AdminDashboard/AdminDashboard";
export { AdminGuard } from "./src/ui/AdminGuard/AdminGuard";
export { BatchOperations } from "./src/ui/admin/BatchOperations/BatchOperations";
export { ExplanationRegeneration } from "./src/ui/admin/ExplanationRegeneration/ExplanationRegeneration";
export { UserManagement } from "./src/ui/admin/UserManagement/UserManagement";
export {
  AudioManagement,
  AudioStatusBadge,
} from "./src/ui/admin/AudioManagement";

// -------- End-user surfaces (deprecated — see VERA-18) --------
//
// Each export below is consumed only by end-user routes inside
// `apps/frontend-next` (Bible reader, topic pages, signup/SSO,
// canvas-confetti / driver.js onboarding, PWA shell). They will be removed
// when those routes are stripped under VERA-21 (T4). Do not add new
// consumers; do not import these from admin code.

/** @deprecated VERA-18: end-user signup. Slated for removal under VERA-21 (T4). */
export { SignIn } from "./src/auth/SignIn";
/** @deprecated VERA-18: end-user signup. Slated for removal under VERA-21 (T4). */
export { SignUp } from "./src/auth/SignUp";
/** @deprecated VERA-18: end-user signup SSO. Slated for removal under VERA-21 (T4). */
export {
  SSOButtons,
  OrDivider,
  type SSOButtonsProps,
} from "./src/auth/SSOButtons";
/** @deprecated VERA-18: end-user auth shell. Slated for removal under VERA-21 (T4). */
export { AuthWrapper as AuthWrapperPage } from "./src/auth/Wrapper";

/** @deprecated VERA-18: end-user reader top-level page. Slated for removal under VERA-21 (T4). */
export { MainPage } from "./src/Main";

/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { Commentary } from "./src/ui/Commentary";
/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { TestamentControl } from "./src/ui/Control";
/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { Footer } from "./src/ui/Footer";
/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { Header } from "./src/ui/Header";
/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { LeftPanel } from "./src/ui/LeftPanel";
/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { MainText } from "./src/ui/MainText";
/** @deprecated VERA-18: end-user nav menu. Slated for removal under VERA-21 (T4). */
export { Menu } from "./src/ui/Menu";
/** @deprecated VERA-18: end-user reader chrome. Slated for removal under VERA-21 (T4). */
export { ProgressBar } from "./src/ui/ProgressBar";
/** @deprecated VERA-18: end-user rating UI. Slated for removal under VERA-21 (T4). */
export { Rating } from "./src/ui/Rating";
/** @deprecated VERA-18: end-user Bible reader UI. Slated for removal under VERA-21 (T4). */
export { RightPanel } from "./src/ui/RightPanel";
/** @deprecated VERA-18: end-user reader dropdown. Slated for removal under VERA-21 (T4). */
export { SelectDropdown } from "./src/ui/SelectDropdown";
/** @deprecated VERA-18: end-user Bible version dropdown. Slated for removal under VERA-21 (T4). */
export { VersionDropdown } from "./src/ui/Dropdown";
/** @deprecated VERA-18: end-user login card. Slated for removal under VERA-21 (T4). */
export { LoginCard } from "./src/ui/LoginCard";
/** @deprecated VERA-18: end-user chapter explanation panel. Slated for removal under VERA-21 (T4). */
export { Explanation } from "./src/ui/Explanation";
/** @deprecated VERA-18: end-user highlights list. Slated for removal under VERA-21 (T4). */
export { HighlightsList } from "./src/ui/Highlights";

/** @deprecated VERA-18: end-user audio player. Slated for removal under VERA-21 (T4). */
export {
  AudioDockBar,
  AudioFullSheet,
  AudioInlineEntry,
  AudioPlayerRoot,
  AudioResumeChip,
} from "./src/ui/AudioPlayer";

/** @deprecated VERA-18: end-user slug helpers (Bible books). Slated for removal under VERA-21 (T4). */
export * from "./src/utils/bookSlugs";
/** @deprecated VERA-18: end-user slug helpers (Topics). Slated for removal under VERA-21 (T4). */
export * from "./src/utils/topicSlugs";
