/**
 * TASK-007: full-screen player sheet. ±15s seek buttons, speed menu,
 * "Go to source" deep link. Opens from AudioDockBar tap.
 *
 * TASK-012 (br-audio-014): emits AUDIO_PLAYBACK_SEEK on scrubber +
 * skip buttons; AUDIO_SPEED_CHANGED on speed buttons.
 *
 * TASK-013 (br-audio-015): renders AudioResumeChip beside Play when
 * useAudioProgress returns a resumable position.
 *
 * TASK-016 (a11y): focus trap on open, focus restore on close,
 * Esc closes, Space toggles play/pause when focus inside the sheet.
 *
 * Styling: CSS modules + open-props.
 */
import { useContext, useEffect, useRef } from "react";
import { ChevronDown, ExternalLink, Pause, Play } from "react-feather";
import { AnalyticsEvent, analytics } from "../../analytics";
import {
  $currentTrack,
  $durationSeconds,
  $elapsedSeconds,
  $fullSheetOpen,
  $playbackState,
  $speed,
  audioPlayerActions,
} from "../../hooks/useAudioPlayerStore";
import { useStore } from "../../utils/use-store";
import { AudioPlayerContext } from "./AudioPlayerContext";
import { AudioResumeChip } from "./AudioResumeChip";
import styles from "./audio-player.module.css";
import { SPEEDS } from "./constants";

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function AudioFullSheet() {
  const open = useStore($fullSheetOpen);
  const track = useStore($currentTrack);
  const state = useStore($playbackState);
  const elapsed = useStore($elapsedSeconds);
  const duration = useStore($durationSeconds);
  const speed = useStore($speed);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Resume state comes from AudioPlayerRoot's hosted useAudioProgress
  // instance so the saver lifecycle isn't gated on this sheet being open.
  const { resumeProgress, consumeResume, dismissResume } =
    useContext(AudioPlayerContext);

  // Focus trap + restore + Esc + Space.
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const focusables = getFocusableElements(sheet);
    focusables[0]?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        audioPlayerActions.closeFullSheet();
        return;
      }
      if (event.key === " " || event.code === "Space") {
        // Spec D1: Space toggles play/pause only when focus is inside
        // the player or full sheet — guard against page-wide hijack.
        if (!sheet.contains(document.activeElement)) return;
        const target = event.target as HTMLElement | null;
        // Don't hijack space when typing in an input or pressing a button.
        if (
          target &&
          (target.tagName === "INPUT" || target.tagName === "BUTTON")
        )
          return;
        event.preventDefault();
        if ($playbackState.get() === "playing") {
          audioPlayerActions.pause();
        } else {
          audioPlayerActions.play();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusableElements(sheet);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  if (!open || !track) return null;

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const to = Number(e.target.value);
    const from = $elapsedSeconds.get();
    audioPlayerActions.seek(to);
    analytics.track(AnalyticsEvent.AUDIO_PLAYBACK_SEEK, {
      explanationId: track.explanation_id,
      fromSeconds: from,
      toSeconds: to,
      direction: to >= from ? "forward" : "backward",
    });
  };

  const handleSkip = (delta: number) => {
    const from = $elapsedSeconds.get();
    audioPlayerActions.seekRelative(delta);
    const to = $elapsedSeconds.get();
    analytics.track(AnalyticsEvent.AUDIO_PLAYBACK_SEEK, {
      explanationId: track.explanation_id,
      fromSeconds: from,
      toSeconds: to,
      direction: delta >= 0 ? "forward" : "backward",
    });
  };

  const handleSpeed = (next: number) => {
    const from = $speed.get();
    if (from === next) return;
    audioPlayerActions.setSpeed(next);
    analytics.track(AnalyticsEvent.AUDIO_SPEED_CHANGED, {
      explanationId: track.explanation_id,
      fromSpeed: from,
      toSpeed: next,
    });
  };

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Full audio player"
      className={styles.fullSheet}
    >
      <header className={styles.fullHeader}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => audioPlayerActions.closeFullSheet()}
          aria-label="Close full player"
        >
          <ChevronDown size={24} />
        </button>
        <a
          href={track.source_href}
          className={styles.goToSource}
          onClick={() => audioPlayerActions.closeFullSheet()}
          aria-label="Go to source explanation"
        >
          Go to source <ExternalLink size={16} />
        </a>
      </header>

      <main className={styles.fullMain}>
        <div className={styles.fullTitleBlock}>
          <div className={styles.fullType}>{track.explanation_type}</div>
          <div className={styles.fullChapter}>
            Chapter {track.chapter_number}
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={elapsed}
          onChange={handleScrubberChange}
          aria-label="Playback position"
          className={styles.scrubber}
        />
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => handleSkip(-15)}
            aria-label="Rewind 15 seconds"
          >
            -15s
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.playLarge}`}
            onClick={() =>
              state === "playing"
                ? audioPlayerActions.pause()
                : audioPlayerActions.play()
            }
            aria-label={state === "playing" ? "Pause" : "Play"}
          >
            {state === "playing" ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => handleSkip(15)}
            aria-label="Forward 15 seconds"
          >
            +15s
          </button>
        </div>

        {resumeProgress && state !== "playing" && (
          <AudioResumeChip
            progress={resumeProgress}
            onResume={() => consumeResume()}
            onRestart={() => dismissResume()}
          />
        )}

        <div className={styles.speedRow}>
          {SPEEDS.map((s) => (
            <button
              type="button"
              key={s}
              className={styles.speedButton}
              onClick={() => handleSpeed(s)}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className={styles.timeCounter}>
          {formatTime(elapsed)} / {formatTime(duration)}
        </div>
      </main>
    </div>
  );
}
