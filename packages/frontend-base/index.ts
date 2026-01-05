/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

"use client";

export { SignIn } from "./src/auth/SignIn";
export { SignUp } from "./src/auth/SignUp";
export {
  SSOButtons,
  OrDivider,
  type SSOButtonsProps,
} from "./src/auth/SSOButtons";
export { AuthWrapper as AuthWrapperPage } from "./src/auth/Wrapper";
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
export * from "./src/utils/bookSlugs";
export * from "./src/utils/topicSlugs";

/**
 * VerseMate UI Components
 */
export { Accordion } from "./src/ui/Accordion";
export { AdminDashboard } from "./src/ui/admin/AdminDashboard/AdminDashboard";
export { AdminGuard } from "./src/ui/AdminGuard/AdminGuard";
export { BatchOperations } from "./src/ui/admin/BatchOperations/BatchOperations";
export { Commentary } from "./src/ui/Commentary";
export { TestamentControl } from "./src/ui/Control";
export { Conversation } from "./src/ui/Conversation";
export { Footer } from "./src/ui/Footer";
export { Header } from "./src/ui/Header";
export { LeftPanel } from "./src/ui/LeftPanel";
export { MainText } from "./src/ui/MainText";
export { Menu } from "./src/ui/Menu";
export { Popover } from "./src/ui/Popover";
export { ProgressBar } from "./src/ui/ProgressBar";
export { Rating } from "./src/ui/Rating";
export { RightPanel } from "./src/ui/RightPanel";
export { SelectDropdown } from "./src/ui/SelectDropdown";
export { MainPage } from "./src/Main";
export { History } from "./src/ui/ConversationHistory";
export { VersionDropdown } from "./src/ui/Dropdown";
export { LoginCard } from "./src/ui/LoginCard";
export { NotFound } from "./src/not-found";
export { Chat } from "./src/ui/Chat";
export { Explanation } from "./src/ui/Explanation";
export { HighlightsList } from "./src/ui/Highlights";
export { ExplanationRegeneration } from "./src/ui/admin/ExplanationRegeneration/ExplanationRegeneration";
export { UserManagement } from "./src/ui/admin/UserManagement/UserManagement";
