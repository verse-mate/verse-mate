/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

"use client";

/**
 * frontend-base admin entry point.
 *
 * Admin-only consumers (e.g. `apps/frontend-next` admin routes) should import
 * from `frontend-base/admin` rather than the root `frontend-base` barrel. The
 * root barrel still re-exports the historical end-user surface (MainPage,
 * SignIn, Bible reader UI, …) which is now marked `@deprecated` and slated for
 * removal once `apps/frontend-next` is reduced to admin-only (VERA-18 / T4).
 */

// Admin shell + dashboard
export { AdminDashboard } from "../src/ui/admin/AdminDashboard/AdminDashboard";
export { AdminGuard } from "../src/ui/AdminGuard/AdminGuard";

// Admin feature modules
export { BatchOperations } from "../src/ui/admin/BatchOperations/BatchOperations";
export { ExplanationRegeneration } from "../src/ui/admin/ExplanationRegeneration/ExplanationRegeneration";
export { UserManagement } from "../src/ui/admin/UserManagement/UserManagement";
export {
  AudioManagement,
  AudioStatusBadge,
} from "../src/ui/admin/AudioManagement";
export { AutoHighlights } from "../src/ui/admin/AutoHighlights";
export { DailyVerses } from "../src/ui/admin/DailyVerses";
export { Explanations } from "../src/ui/admin/Explanations/Explanations";
export { Playground } from "../src/ui/admin/Playground/Playground";
export { PromptManagement } from "../src/ui/admin/PromptManagement/PromptManagement";
export { TopicsAdmin } from "../src/ui/admin/Topics";

// Admin-specific hooks
export {
  useAdminAudioList,
  useAdminAudioRegenerate,
  useAdminAudioDelete,
  type AdminAudioStatus,
  type AdminAudioRow,
  type AdminAudioListResponse,
  type AdminAudioFilters,
  type BulkRegenerateBody,
} from "../src/hooks/useAdminAudio";

// Shared UI primitives admin pages depend on. Re-exported so admin consumers
// never need to reach into the deprecated root barrel.
export { Notifications, notify } from "../src/notification";
export { Alert } from "../src/ui/Alert/Alert";
export { Button } from "../src/ui/Button/Button";
export { Checkbox } from "../src/ui/Checkbox/Checkbox";
export {
  CheckboxList,
  type CheckboxListProps,
} from "../src/ui/CheckboxList/CheckboxList";
export { Combobox, type ComboboxProps } from "../src/ui/ComboBox/Combobox";
export { Container } from "../src/ui/Container/Container";
export * from "../src/ui/Dialog";
export * from "../src/ui/Icons";
export { Input } from "../src/ui/Input";
export { Legend } from "../src/ui/Legend/Legend";
export { Link } from "../src/ui/Link";
export { Table, type TableProps } from "../src/ui/Table";
export { Text } from "../src/ui/Text/Text";
export { Tooltip } from "../src/ui/Tooltip/Tooltip";

// Auth utilities used by admin login flow
export * from "../src/utils/auth-utils";
export { safePromise } from "../src/utils/safe-promise";
