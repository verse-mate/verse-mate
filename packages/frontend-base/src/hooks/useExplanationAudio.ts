/**
 * TASK-007: fetch + poll the explanation-audio endpoint.
 *
 * Server returns either:
 *   200 { audio }                — ready now
 *   202 { job: { job_id, ... } } — generation in flight; poll /jobs/:id
 *
 * Consumers call `useExplanationAudio({ explanationId, voice?, language? })`
 * and get back { audio, jobStatus, isLoading, isGenerating, error }.
 */
import { useQuery } from "@tanstack/react-query";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;

export interface AudioEntry {
  audio_id: string;
  url: string;
  duration_seconds: number;
  character_count: number;
  voice: string;
  language_code: string;
  is_stale: boolean;
  generated_at: string;
  tts_provider: string;
  tts_model: string;
  storage_key: string;
}

interface AudioResponse {
  audio?: AudioEntry;
  job?: { job_id: string; estimated_ready_seconds: number };
}

interface JobStatusResponse {
  job: {
    job_id: string;
    status: "queued" | "active" | "completed" | "failed";
    audio?: AudioEntry;
    error_code?: string;
  };
}

export interface UseExplanationAudioArgs {
  explanationId: number | null;
  voice?: string;
  language?: string;
  /** Injectable for unit tests. Defaults to window.fetch. */
  fetchFn?: typeof fetch;
  /** API base URL. Defaults to /api relative. */
  baseUrl?: string;
  enabled?: boolean;
}

export interface UseExplanationAudioResult {
  audio: AudioEntry | null;
  jobStatus:
    | "idle"
    | "queued"
    | "active"
    | "completed"
    | "failed"
    | "timeout"
    | null;
  isLoading: boolean;
  isGenerating: boolean;
  estimatedReadySeconds: number | null;
  error: Error | null;
}

async function requestAudio(
  baseUrl: string,
  explanationId: number,
  voice: string | undefined,
  language: string | undefined,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: AudioResponse }> {
  const params = new URLSearchParams();
  if (voice) params.set("voice", voice);
  if (language) params.set("language", language);
  const qs = params.toString();
  const url = `${baseUrl}/bible/explanation/audio/${explanationId}${qs ? `?${qs}` : ""}`;
  const response = await fetchFn(url, { credentials: "include" });
  const body = response.status === 204 ? {} : await response.json();
  return { status: response.status, body };
}

async function pollJob(
  baseUrl: string,
  jobId: string,
  fetchFn: typeof fetch,
): Promise<JobStatusResponse["job"]> {
  const response = await fetchFn(
    `${baseUrl}/bible/explanation/audio/jobs/${encodeURIComponent(jobId)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(`Job status failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as JobStatusResponse;
  return body.job;
}

async function fetchAudioWithPolling(args: {
  baseUrl: string;
  explanationId: number;
  voice?: string;
  language?: string;
  fetchFn: typeof fetch;
}): Promise<AudioEntry> {
  const initial = await requestAudio(
    args.baseUrl,
    args.explanationId,
    args.voice,
    args.language,
    args.fetchFn,
  );
  if (initial.status === 200 && initial.body.audio) return initial.body.audio;
  if (initial.status !== 202 || !initial.body.job) {
    throw new Error(`Unexpected audio response: ${initial.status}`);
  }

  const { job_id } = initial.body.job;
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const job = await pollJob(args.baseUrl, job_id, args.fetchFn);
    if (job.status === "completed" && job.audio) return job.audio;
    if (job.status === "failed") {
      throw new Error(`Generation failed: ${job.error_code ?? "UNKNOWN"}`);
    }
  }
  throw new Error("Audio generation timed out after 30s");
}

export function useExplanationAudio(
  args: UseExplanationAudioArgs,
): UseExplanationAudioResult {
  const {
    explanationId,
    voice,
    language,
    fetchFn = typeof fetch === "function" ? fetch.bind(globalThis) : undefined,
    baseUrl = "/api",
    enabled = true,
  } = args;

  const query = useQuery({
    queryKey: ["explanation-audio", explanationId, voice, language],
    enabled: enabled && explanationId !== null && !!fetchFn,
    queryFn: () =>
      fetchAudioWithPolling({
        baseUrl,
        explanationId: explanationId as number,
        voice,
        language,
        fetchFn: fetchFn as typeof fetch,
      }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isGenerating = query.fetchStatus === "fetching" && !query.data;

  return {
    audio: query.data ?? null,
    jobStatus: query.isError ? "failed" : query.isSuccess ? "completed" : null,
    isLoading: query.isLoading,
    isGenerating,
    estimatedReadySeconds: isGenerating ? 8 : null,
    error: query.error instanceof Error ? query.error : null,
  };
}
