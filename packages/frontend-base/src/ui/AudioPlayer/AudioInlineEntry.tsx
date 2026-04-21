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
 * partial) from useExplanationAudio + the player store.
 */
import { useStore } from "../../utils/use-store";

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
        className="audio-inline-entry error"
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
        data-state="error"
      >
        Audio unavailable — Retry
      </button>
    );
  }

  if (isGenerating || !audio) {
    const secs = estimatedReadySeconds ?? 8;
    return (
      <div
        className="audio-inline-entry loading"
        data-state="loading"
        aria-live="polite"
      >
        <span className="spinner" aria-hidden="true" />
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
      audio_id: audio.audio_id,
      explanation_id: props.explanationId as number,
      url: audio.url,
      duration_seconds: audio.duration_seconds,
      voice: audio.voice,
      language_code: audio.language_code,
      explanation_type: props.explanationType,
      book_id: props.bookId,
      chapter_number: props.chapterNumber,
      tts_provider: audio.tts_provider,
      source_href: props.sourceHref,
    };
    if (!isThisTrack) audioPlayerActions.load(track);
    audioPlayerActions.play();
  };

  return (
    <button
      type="button"
      className="audio-inline-entry populated"
      onClick={startTrack}
      data-state={playingThis ? "playing" : "populated"}
      style={{
        minHeight: "44px",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5em",
      }}
    >
      <Play size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
