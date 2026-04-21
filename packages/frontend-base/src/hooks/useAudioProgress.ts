/**
 * TASK-008: browser-side resume logic.
 *
 * Responsibilities:
 *   - Fetch the existing resume position at mount (`/progress` GET).
 *   - Save progress every 15s while playing + on pause + on
 *     `beforeunload` (via `sendBeacon` so the write survives the page
 *     being torn down).
 *   - Send the `complete` reason when playback ends (the server handles
 *     the DELETE semantically).
 *
 * The component calling this hook is expected to be mounted whenever
 * a track is loaded; the store's $currentTrack + $playbackState atoms
 * drive when the hook is active.
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "../utils/use-store";
import {
  $currentTrack,
  $elapsedSeconds,
  $playbackState,
} from "./useAudioPlayerStore";

export interface ResumeProgress {
  position_seconds: number;
  duration_seconds: number;
  updated_at: string;
}

export type SaveReason = "pause" | "complete" | "background" | "navigation";

export interface UseAudioProgressArgs {
  /** Injectable for unit tests. Defaults to window.fetch. */
  fetchFn?: typeof fetch;
  /** Defaults to navigator.sendBeacon. */
  sendBeaconFn?: (url: string, data: string) => boolean;
  /** API base URL. */
  baseUrl?: string;
  /** Interval between background saves, ms. Defaults to 15s. */
  saveIntervalMs?: number;
  /** Disable the hook entirely (e.g., for guests). */
  disabled?: boolean;
}

export interface UseAudioProgressResult {
  resumeProgress: ResumeProgress | null;
  isLoading: boolean;
  /** Caller uses this before play() to honor resume (TASK-008 AC). */
  consumeResume: () => ResumeProgress | null;
  /** Manually dismiss the resume chip (Restart button). */
  dismissResume: () => void;
}

function endpoint(baseUrl: string, explanationId: number): string {
  return `${baseUrl}/bible/explanation/audio/${explanationId}/progress`;
}

export function useAudioProgress(
  args: UseAudioProgressArgs = {},
): UseAudioProgressResult {
  const {
    fetchFn = typeof fetch === "function" ? fetch.bind(globalThis) : undefined,
    sendBeaconFn = typeof navigator !== "undefined" && navigator.sendBeacon
      ? navigator.sendBeacon.bind(navigator)
      : undefined,
    baseUrl = "/api",
    saveIntervalMs = 15_000,
    disabled = false,
  } = args;

  const track = useStore($currentTrack);
  const playbackState = useStore($playbackState);
  const [resumeProgress, setResumeProgress] = useState<ResumeProgress | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const dismissedForIdRef = useRef<number | null>(null);

  // Fetch resume on track change (br-audio-004 validate-on-read).
  useEffect(() => {
    if (disabled || !track || !fetchFn) {
      setResumeProgress(null);
      return;
    }
    const explanationId = track.explanation_id;
    if (dismissedForIdRef.current === explanationId) return;

    let cancelled = false;
    setIsLoading(true);
    fetchFn(endpoint(baseUrl, explanationId), { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setResumeProgress(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as ResumeProgress;
        setResumeProgress(data);
      })
      .catch(() => {
        // Swallow — 404/offline both yield "no resume chip".
        if (!cancelled) setResumeProgress(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [track, disabled, fetchFn, baseUrl]);

  // Periodic save while playing.
  useEffect(() => {
    if (disabled || !track || !fetchFn) return;
    if (playbackState !== "playing") return;
    const interval = window.setInterval(() => {
      const currentTrack = $currentTrack.get();
      if (!currentTrack) return;
      const elapsed = $elapsedSeconds.get();
      fetchFn(endpoint(baseUrl, currentTrack.explanation_id), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position_seconds: elapsed,
          duration_seconds: currentTrack.duration_seconds,
          reason: "pause" as SaveReason,
        }),
      }).catch(() => {});
    }, saveIntervalMs);
    return () => window.clearInterval(interval);
  }, [playbackState, track, fetchFn, baseUrl, disabled, saveIntervalMs]);

  // Save on pause.
  const prevStateRef = useRef(playbackState);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = playbackState;
    if (disabled || !track || !fetchFn) return;
    if (prev === "playing" && playbackState === "paused") {
      fetchFn(endpoint(baseUrl, track.explanation_id), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position_seconds: $elapsedSeconds.get(),
          duration_seconds: track.duration_seconds,
          reason: "pause" as SaveReason,
        }),
      }).catch(() => {});
    }
    if (playbackState === "ended") {
      fetchFn(endpoint(baseUrl, track.explanation_id), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position_seconds: $elapsedSeconds.get(),
          duration_seconds: track.duration_seconds,
          reason: "complete" as SaveReason,
        }),
      }).catch(() => {});
    }
  }, [playbackState, track, fetchFn, baseUrl, disabled]);

  // Save on beforeunload via sendBeacon.
  useEffect(() => {
    if (disabled || !track || !sendBeaconFn) return;
    const handler = () => {
      const currentTrack = $currentTrack.get();
      if (!currentTrack) return;
      const state = $playbackState.get();
      if (state !== "playing" && state !== "paused") return;
      const body = JSON.stringify({
        position_seconds: $elapsedSeconds.get(),
        duration_seconds: currentTrack.duration_seconds,
        reason: "navigation" as SaveReason,
      });
      sendBeaconFn(
        endpoint(baseUrl, currentTrack.explanation_id),
        new Blob([body], { type: "application/json" }) as unknown as string,
      );
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [track, sendBeaconFn, baseUrl, disabled]);

  return {
    resumeProgress,
    isLoading,
    consumeResume: () => {
      const r = resumeProgress;
      setResumeProgress(null);
      return r;
    },
    dismissResume: () => {
      if (track) dismissedForIdRef.current = track.explanation_id;
      setResumeProgress(null);
    },
  };
}
