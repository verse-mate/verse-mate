/**
 * @deprecated D-009 + D-014 — Q&A feature removed; frontend-next is admin-only.
 *
 * This file is part of the user-facing Bible reader Chat / Q&A flow that has
 * been deprecated per Phase 1 decision D-009 (Q&A removed entirely) AND
 * Epic 12 (frontend-next scoped to admin-only).
 *
 * Removal is pending — companion PR to "feat: drop Q&A entirely" (#204) will
 * delete this file along with the Chat UI and migrate consumers in
 * main-content.tsx, RightPanel, Header.
 *
 * Do NOT add new code here; do NOT add new callers.
 */

import { Content } from "./Content/content";
import { HistoryButton } from "./HistoryButton/history-button";
import { HistoryLabel } from "./HistoryLabel/history-label";
import { Root } from "./Root/root";

export const History = {
  Root,
  Content,
  HistoryLabel,
  HistoryButton,
};
