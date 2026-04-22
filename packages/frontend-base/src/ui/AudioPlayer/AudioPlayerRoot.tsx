/**
 * TASK-007: mounts the single <audio> element for the web player.
 *
 * Rendered once, at the app layout root (above route outlets) so
 * route changes never unmount it (br-audio-011: cross-nav continuity).
 * Wires the audio events back into the nanostore.
 *
 * TASK-012 (br-audio-014): fires AUDIO_PLAYBACK_STARTED / PAUSED /
 * COMPLETED directly on state transitions. SEEK + SPEED_CHANGED fire
 * from AudioFullSheet where the user gesture lives.
 *
 * TASK-013 (review): hosts the always-on useAudioProgress instance so
 * periodic save + beforeunload run for the entire playback lifecycle,
 * not just while the sheet is open. AudioFullSheet reads the resume
 * state via AudioPlayerContext.
 */
import { useEffect, useRef } from "react";
import { AnalyticsEvent, analytics } from "../../analytics";
import {
  $currentTrack,
  $durationSeconds,
  $lastPlayContext,
  $playbackState,
  audioPlayerActions,
} from "../../hooks/useAudioPlayerStore";
import { useAudioProgress } from "../../hooks/useAudioProgress";
import { useStore } from "../../utils/use-store";
import { AudioDockBar } from "./AudioDockBar";
import { AudioFullSheet } from "./AudioFullSheet";
import { AudioPlayerContext } from "./AudioPlayerContext";

export function AudioPlayerRoot() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = useStore($currentTrack);
  const playbackState = useStore($playbackState);

  // Always-on resume/save lifecycle. Disabled until a track is loaded.
  const { resumeProgress, consumeResume, dismissResume } = useAudioProgress({
    disabled: !currentTrack,
  });

  // Bridge the element to the store's non-React controller.
  useEffect(() => {
    audioPlayerActions._setAudioElement(audioRef.current);
    return () => {
      audioPlayerActions._setAudioElement(null);
    };
  }, []);

  // Emit analytics on state transitions. Single emission point so the
  // 5-event surface stays consistent with br-audio-014.
  const prevStateRef = useRef(playbackState);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = playbackState;
    if (!currentTrack) return;

    if (prev !== "playing" && playbackState === "playing") {
      const ctx = $lastPlayContext.get() ?? { isResume: false };
      analytics.track(AnalyticsEvent.AUDIO_PLAYBACK_STARTED, {
        explanationId: currentTrack.explanation_id,
        explanationType: currentTrack.explanation_type,
        bookId: currentTrack.book_id,
        chapterNumber: currentTrack.chapter_number,
        voice: currentTrack.voice,
        languageCode: currentTrack.language_code,
        isResume: ctx.isResume,
        resumePositionSeconds: ctx.resumePositionSeconds,
        ttsProvider: currentTrack.tts_provider,
      });
    } else if (prev === "playing" && playbackState === "paused") {
      analytics.track(AnalyticsEvent.AUDIO_PLAYBACK_PAUSED, {
        explanationId: currentTrack.explanation_id,
        positionSeconds: audioRef.current?.currentTime ?? 0,
        durationSeconds: $durationSeconds.get(),
        reason: "user",
      });
    } else if (playbackState === "ended") {
      analytics.track(AnalyticsEvent.AUDIO_PLAYBACK_COMPLETED, {
        explanationId: currentTrack.explanation_id,
        durationSeconds: $durationSeconds.get(),
        completedBy: "natural",
      });
    }
  }, [playbackState, currentTrack]);

  return (
    <AudioPlayerContext.Provider
      value={{ resumeProgress, consumeResume, dismissResume }}
    >
      <div
        role="region"
        aria-label="Audio player"
        data-testid="audio-player-root"
      >
        {/* biome-ignore lint/a11y/useMediaCaption: audio caption not applicable for TTS output */}
        <audio
          ref={audioRef}
          preload="metadata"
          onTimeUpdate={() => {
            if (audioRef.current)
              audioPlayerActions._onTimeUpdate(audioRef.current.currentTime);
          }}
          onDurationChange={() => {
            if (audioRef.current)
              audioPlayerActions._onDurationChange(audioRef.current.duration);
          }}
          onEnded={() => audioPlayerActions._onEnded()}
          onError={(e) =>
            audioPlayerActions._onError(
              e.currentTarget.error?.message ?? "audio error",
            )
          }
        />
        <AudioDockBar />
        <AudioFullSheet />
      </div>
    </AudioPlayerContext.Provider>
  );
}
