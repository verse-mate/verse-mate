/**
 * TASK-006 (frontend) / TASK-014 (styling): status badge for the admin
 * audio panel. Status colors live in the CSS module via [data-status]
 * selectors — no hardcoded hex, no inline styles.
 */
import type { AdminAudioStatus } from "../../../hooks/useAdminAudio";
import styles from "./audio-management.module.css";

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
      className={styles.badge}
      data-status={status}
    >
      {label}
    </span>
  );
}
