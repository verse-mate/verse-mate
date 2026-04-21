/**
 * TASK-006 (frontend): reusable status badge for the admin audio panel.
 * Semantic colors via CSS vars so overrides live in the host app's
 * design tokens (no hardcoded hex).
 */
import type { AdminAudioStatus } from "../../../hooks/useAdminAudio";

export interface AudioStatusBadgeProps {
  status: AdminAudioStatus;
  voice?: string | null;
  languageCode?: string | null;
}

const STATUS_LABEL: Record<AdminAudioStatus, string> = {
  current: "Current",
  stale: "Stale",
  missing: "Missing",
  failed: "Failed",
};

const STATUS_VAR: Record<AdminAudioStatus, string> = {
  current: "var(--color-success, #10b981)",
  stale: "var(--color-warning, #f59e0b)",
  missing: "var(--color-text-muted, #9ca3af)",
  failed: "var(--color-danger, #ef4444)",
};

export function AudioStatusBadge(props: AudioStatusBadgeProps) {
  const { status, voice, languageCode } = props;
  const label =
    status === "current" && voice && languageCode
      ? `Current · ${voice} · ${languageCode}`
      : STATUS_LABEL[status];

  return (
    <span
      role="status"
      aria-label={`Audio status: ${label}`}
      style={{
        display: "inline-flex",
        padding: "0.25rem 0.5rem",
        borderRadius: "0.25rem",
        backgroundColor: `color-mix(in srgb, ${STATUS_VAR[status]} 15%, transparent)`,
        color: STATUS_VAR[status],
        fontSize: "0.75rem",
        fontWeight: 600,
        minHeight: "1.5rem",
      }}
    >
      {label}
    </span>
  );
}
