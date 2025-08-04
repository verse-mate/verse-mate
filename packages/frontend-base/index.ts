/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

"use client";

export { SignIn } from "./src/auth/SignIn";
export { SignUp } from "./src/auth/SignUp";
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

/**
 * VerseMate UI Components
 */
export { Accordion } from "./src/ui/Accordion";
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

/**
 * PWA & Offline Components
 */
export { OfflineIndicator } from "./src/ui/OfflineIndicator";
export { OfflineDownload } from "./src/ui/OfflineDownload";
export { CacheSettings } from "./src/ui/CacheSettings";

/**
 * PWA & Offline Hooks
 */
export { useNetworkStatus } from "./src/hooks/useNetworkStatus";
export { useOfflineBibleChapter } from "./src/hooks/useOfflineBibleChapter";
export { useOfflineBibleExplanation } from "./src/hooks/useOfflineBibleExplanation";
export {
  useExplanation,
  useExplanationControl,
} from "./src/hooks/useExplanation";
export { useChapter } from "./src/hooks/useChapter";
export { useOfflineBookManager } from "./src/hooks/useOfflineBookManager";

/**
 * PWA & Offline Utilities
 */
export * from "./src/utils/offline-bible-cache";
export * from "./src/utils/offline-sync";
export * from "./src/utils/cache-manager";
