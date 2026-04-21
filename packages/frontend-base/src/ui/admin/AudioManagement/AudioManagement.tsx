/**
 * TASK-006 (frontend): admin audio control panel.
 *
 * Standalone page showing every explanation + its audio status, with
 * per-row Regenerate / Delete actions and a toolbar "Regenerate
 * (filtered)" bulk button. Designed to be mounted as a new admin route;
 * integrating the audio *column* into the existing Explanations admin
 * table is a separate polish step flagged in tasks.md.
 */
import { Fragment, useState } from "react";
import {
  type AdminAudioFilters,
  useAdminAudioDelete,
  useAdminAudioList,
  useAdminAudioRegenerate,
} from "../../../hooks/useAdminAudio";
import { AudioStatusBadge } from "./AudioStatusBadge";

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
      <header
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          padding: "1rem 0",
        }}
      >
        <h2 style={{ flex: 1, margin: 0 }}>Explanation audio</h2>
        <label
          style={{
            display: "inline-flex",
            gap: "0.25rem",
            alignItems: "center",
          }}
        >
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
            style={{ minHeight: 44 }}
          />
        </label>
        <label
          style={{
            display: "inline-flex",
            gap: "0.25rem",
            alignItems: "center",
          }}
        >
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
          style={{ minHeight: 44 }}
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
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption style={{ textAlign: "left", padding: "0.5rem 0" }}>
            {data.total} explanations
          </caption>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Book / Chapter</th>
              <th style={{ textAlign: "left" }}>Type</th>
              <th style={{ textAlign: "left" }}>Language</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Duration</th>
              <th style={{ textAlign: "left" }}>Actions</th>
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
                        style={{ minHeight: 44, marginRight: "0.5rem" }}
                        disabled={regen.isPending}
                      >
                        Regenerate
                      </button>
                      {row.audio_id ? (
                        <button
                          type="button"
                          onClick={() => del.mutate(row.audio_id as string)}
                          aria-label={`Delete audio ${row.audio_id}`}
                          style={{ minHeight: 44, marginRight: "0.5rem" }}
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
                        style={{ minHeight: 44 }}
                      >
                        {expanded ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr id={`details-${rowKey}`}>
                      <td colSpan={6}>
                        <dl
                          style={{
                            display: "grid",
                            gridTemplateColumns: "max-content 1fr",
                            gap: "0.25rem 1rem",
                          }}
                        >
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
                            <code style={{ fontSize: "0.875em" }}>
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
