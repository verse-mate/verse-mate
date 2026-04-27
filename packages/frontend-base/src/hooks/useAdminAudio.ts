/**
 * TASK-006 (frontend): TanStack Query bindings for the admin audio
 * endpoints added in commit 8472e8f.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AdminAudioStatus = "current" | "stale" | "missing" | "failed";

export interface AdminAudioRow {
  audio_id: string | null;
  explanation_id: number;
  chapter_id: number;
  book_id: number;
  chapter_number: number;
  explanation_type: string;
  language_code: string;
  voice: string | null;
  duration_seconds: number | null;
  generated_at: string | null;
  tts_provider: string | null;
  tts_model: string | null;
  content_hash: string | null;
  storage_key: string | null;
  status: AdminAudioStatus;
}

export interface AdminAudioListResponse {
  rows: AdminAudioRow[];
  total: number;
}

export interface AdminAudioFilters {
  language?: string;
  voice?: string;
  isStale?: boolean;
  chapterId?: number;
  type?: string;
  versionKey?: string;
  limit?: number;
  offset?: number;
}

interface HookArgs {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

function buildQS(filters: AdminAudioFilters): string {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  if (filters.voice) params.set("voice", filters.voice);
  if (filters.isStale !== undefined)
    params.set("isStale", String(filters.isStale));
  if (filters.chapterId !== undefined)
    params.set("chapterId", String(filters.chapterId));
  if (filters.type) params.set("type", filters.type);
  if (filters.versionKey) params.set("versionKey", filters.versionKey);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined)
    params.set("offset", String(filters.offset));
  return params.toString();
}

export function useAdminAudioList(
  filters: AdminAudioFilters,
  { baseUrl = "/api", fetchFn = fetch }: HookArgs = {},
) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ["admin-audio", filters],
    queryFn: async () => {
      const res = await fetchFn(
        `${baseUrl}/admin/explanations/audio${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`List failed: HTTP ${res.status}`);
      return (await res.json()) as AdminAudioListResponse;
    },
  });
}

export interface BulkRegenerateBody {
  explanationIds?: number[];
  filters?: {
    bookId?: number;
    chapterNumber?: number;
    type?: string;
    versionKey?: string;
    languageCode?: string;
  };
  voice?: string;
  language?: string;
}

export function useAdminAudioRegenerate({
  baseUrl = "/api",
  fetchFn = fetch,
}: HookArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkRegenerateBody) => {
      const res = await fetchFn(
        `${baseUrl}/admin/explanations/audio/regenerate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`Regenerate failed: HTTP ${res.status}`);
      return (await res.json()) as { batch_id: string; job_count: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-audio"] });
    },
  });
}

export function useAdminAudioDelete({
  baseUrl = "/api",
  fetchFn = fetch,
}: HookArgs = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (audioId: string) => {
      const res = await fetchFn(
        `${baseUrl}/admin/explanations/audio/${audioId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-audio"] });
    },
  });
}
