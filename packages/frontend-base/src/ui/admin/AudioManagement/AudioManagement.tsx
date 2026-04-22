/**
 * TASK-006 (frontend) / TASK-014 (styling + admin route mount):
 * admin audio control panel. Each row shows an explanation + its audio
 * status, with per-row Regenerate / Delete actions and a toolbar
 * "Regenerate (filtered)" bulk button.
 *
 * Mounted as a tab in AdminDashboard so admins can reach it from
 * /admin (br-audio-016).
 *
 * Styling: CSS modules + open-props — no inline styles, no hardcoded
 * px / hex.
 */
import { Fragment, useState } from "react";
import {
  type AdminAudioFilters,
  useAdminAudioDelete,
  useAdminAudioList,
  useAdminAudioRegenerate,
} from "../../../hooks/useAdminAudio";
import { AudioStatusBadge } from "./AudioStatusBadge";
import styles from "./audio-management.module.css";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export interface AudioManagementProps {
  initialFilters?: AdminAudioFilters;
}

export function AudioManagement(props: AudioManagementProps = {}) {
  const [filters, setFilters] = useState<AdminAudioFilters>(
    props.initialFilters ?? { limit: 50, offset: 0 },
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useAdminAudioList(filters);
  const regen = useAdminAudioRegenerate();
  const del = useAdminAudioDelete();

  const toggleExpanded = (id: string) =>
    setExpandedId((cur) => (cur === id ? null : id));

  return (
    <section aria-label="Admin audio management">
      <header className={styles.toolbar}>
        <h2 className={styles.title}>Explanation audio</h2>
        <label className={styles.filterLabel}>
          Language
          <input
            value={filters.language ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                language: e.target.value || undefined,
                offset: 0,
              }))
            }
            placeholder="en"
            className={styles.filterInput}
          />
        </label>
        <label className={styles.filterLabel}>
          Stale only
          <input
            type="checkbox"
            checked={filters.isStale === true}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                isStale: e.target.checked ? true : undefined,
                offset: 0,
              }))
            }
          />
        </label>
        <button
          type="button"
          onClick={() =>
            regen.mutate({
              filters: {
                languageCode: filters.language,
                type: filters.type,
              },
            })
          }
          disabled={regen.isPending}
          aria-label="Regenerate audio for all rows matching the current filters"
          className={styles.bulkButton}
        >
          {regen.isPending ? "Queuing…" : "Regenerate audio (filtered)"}
        </button>
      </header>

      {error ? (
        <div role="alert">Failed to load audios: {error.message}</div>
      ) : isLoading ? (
        <div aria-live="polite">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div>No explanations match the current filters.</div>
      ) : (
        <table className={styles.table}>
          <caption className={styles.caption}>
            {data.total} explanations
          </caption>
          <thead>
            <tr>
              <th className={styles.cellLeft}>Book / Chapter</th>
              <th className={styles.cellLeft}>Type</th>
              <th className={styles.cellLeft}>Language</th>
              <th className={styles.cellLeft}>Status</th>
              <th className={styles.cellLeft}>Duration</th>
              <th className={styles.cellLeft}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const rowKey = row.audio_id ?? `exp-${row.explanation_id}`;
              const expanded = expandedId === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr>
                    <td>
                      {row.book_id} / {row.chapter_number}
                    </td>
                    <td>{row.explanation_type}</td>
                    <td>{row.language_code}</td>
                    <td>
                      <AudioStatusBadge
                        status={row.status}
                        voice={row.voice}
                        languageCode={row.language_code}
                      />
                    </td>
                    <td>{formatDuration(row.duration_seconds)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          regen.mutate({
                            explanationIds: [row.explanation_id],
                          })
                        }
                        aria-label={`Regenerate audio for explanation ${row.explanation_id}`}
                        className={styles.actionButton}
                        disabled={regen.isPending}
                      >
                        Regenerate
                      </button>
                      {row.audio_id ? (
                        <button
                          type="button"
                          onClick={() => del.mutate(row.audio_id as string)}
                          aria-label={`Delete audio ${row.audio_id}`}
                          className={styles.actionButton}
                          disabled={del.isPending}
                        >
                          Delete
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleExpanded(rowKey)}
                        aria-expanded={expanded}
                        aria-controls={`details-${rowKey}`}
                        className={styles.actionButton}
                      >
                        {expanded ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr id={`details-${rowKey}`}>
                      <td colSpan={6}>
                        <dl className={styles.detailsList}>
                          <dt>Audio id</dt>
                          <dd>{row.audio_id ?? "—"}</dd>
                          <dt>Voice</dt>
                          <dd>{row.voice ?? "—"}</dd>
                          <dt>Generated at</dt>
                          <dd>{formatDate(row.generated_at)}</dd>
                          <dt>TTS provider / model</dt>
                          <dd>
                            {row.tts_provider ?? "—"} / {row.tts_model ?? "—"}
                          </dd>
                          <dt>Content hash</dt>
                          <dd>
                            <code className={styles.contentHash}>
                              {row.content_hash ?? "—"}
                            </code>
                          </dd>
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
