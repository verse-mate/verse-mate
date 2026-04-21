/**
 * TASK-007: mounts the single <audio> element for the web player.
 *
 * Rendered once, at the app layout root (above route outlets) so
 * route changes never unmount it (br-audio-011: cross-nav continuity).
 * Wires the audio events back into the nanostore.
 */
import { useEffect, useRef } from "react";
import {
  $currentTrack,
  $playbackState,
  audioPlayerActions,
} from "../../hooks/useAudioPlayerStore";
import { useStore } from "../../utils/use-store";
import { AudioDockBar } from "./AudioDockBar";
import { AudioFullSheet } from "./AudioFullSheet";

export interface AudioPlayerRootProps {
  onPlaybackStarted?: (track: ReturnType<typeof $currentTrack.get>) => void;
  onPlaybackPaused?: (positionSeconds: number) => void;
  onPlaybackCompleted?: () => void;
}

export function AudioPlayerRoot(props: AudioPlayerRootProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = useStore($currentTrack);
  const playbackState = useStore($playbackState);

  // Bridge the element to the store's non-React controller.
  useEffect(() => {
    audioPlayerActions._setAudioElement(audioRef.current);
    return () => {
      audioPlayerActions._setAudioElement(null);
    };
  }, []);

  // Observe state transitions for analytics.
  const prevStateRef = useRef(playbackState);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = playbackState;
    if (prev !== "playing" && playbackState === "playing") {
      props.onPlaybackStarted?.(currentTrack);
    } else if (prev === "playing" && playbackState === "paused") {
      props.onPlaybackPaused?.(audioRef.current?.currentTime ?? 0);
    } else if (playbackState === "ended") {
      props.onPlaybackCompleted?.();
    }
  }, [playbackState, currentTrack, props]);

  return (
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
  );
}
