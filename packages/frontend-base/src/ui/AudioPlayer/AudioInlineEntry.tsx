import { useQueryClient } from "@tanstack/react-query";
import { Play } from "react-feather";
import {
  $currentTrack,
  $playbackState,
  type AudioTrack,
  audioPlayerActions,
} from "../../hooks/useAudioPlayerStore";
import {
  type UseExplanationAudioArgs,
  useExplanationAudio,
} from "../../hooks/useExplanationAudio";
/**
 * TASK-007: inline "Listen · 3:47" chip shown above each explanation tab.
 *
 * Surfaces all 5 spec-D1 states (loading / empty / error / populated /
 * partial) from useExplanationAudio + the player store. Styling goes
 * through the project's CSS-module + open-props pattern — no inline
 * styles, no hardcoded px/hex.
 */
import { useStore } from "../../utils/use-store";
import styles from "./audio-player.module.css";

export interface AudioInlineEntryProps extends UseExplanationAudioArgs {
  explanationType: string;
  bookId: number;
  chapterNumber: number;
  sourceHref: string;
}

function formatDuration(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function AudioInlineEntry(props: AudioInlineEntryProps) {
  const { audio, isGenerating, estimatedReadySeconds, error } =
    useExplanationAudio(props);
  const currentTrack = useStore($currentTrack);
  const playbackState = useStore($playbackState);
  const queryClient = useQueryClient();
  const isThisTrack = currentTrack?.explanation_id === props.explanationId;

  if (error) {
    return (
      <button
        type="button"
        className={styles.inlineEntry}
        data-state="error"
        data-testid="audio-inline-entry"
        onClick={() =>
          queryClient.invalidateQueries({
            queryKey: [
              "explanation-audio",
              props.explanationId,
              props.voice,
              props.language,
            ],
          })
        }
        aria-label={`Audio unavailable — retry (${error.message})`}
      >
        Audio unavailable — Retry
      </button>
    );
  }

  if (isGenerating || !audio) {
    const secs = estimatedReadySeconds ?? 8;
    return (
      <div
        className={styles.inlineEntry}
        data-state="loading"
        data-testid="audio-inline-entry"
        aria-live="polite"
      >
        <span className={styles.spinner} aria-hidden="true" />
        Generating… ~{secs}s
      </div>
    );
  }

  const playingThis = isThisTrack && playbackState === "playing";
  const label = playingThis
    ? "Playing…"
    : `Listen · ${formatDuration(audio.duration_seconds)}`;

  const startTrack = () => {
    const track: AudioTrack = {
      audio_id: `exp-${props.explanationId}`,
      explanation_id: props.explanationId as number,
      url: audio.url,
      duration_seconds: audio.duration_seconds,
      voice: audio.voice,
      language_code: audio.language_code,
      explanation_type: props.explanationType,
      book_id: props.bookId,
      chapter_number: props.chapterNumber,
      // br-audio-007: Reader DTO does not expose provider; analytics
      // surfaces "unknown" rather than misreporting.
      tts_provider: "unknown",
      source_href: props.sourceHref,
    };
    if (!isThisTrack) audioPlayerActions.load(track);
    audioPlayerActions.play();
  };

  return (
    <button
      type="button"
      className={styles.inlineEntry}
      data-state={playingThis ? "playing" : "populated"}
      data-testid="audio-inline-entry"
      onClick={startTrack}
    >
      <Play size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
