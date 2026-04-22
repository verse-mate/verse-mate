/**
 * TASK-007: full-screen player sheet. ±15s seek buttons, speed menu,
 * "Go to source" deep link. Opens from AudioDockBar tap.
 *
 * Styling: CSS modules + open-props.
 */
import { ChevronDown, ExternalLink, Pause, Play } from "react-feather";
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
import styles from "./audio-player.module.css";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function AudioFullSheet() {
  const open = useStore($fullSheetOpen);
  const track = useStore($currentTrack);
  const state = useStore($playbackState);
  const elapsed = useStore($elapsedSeconds);
  const duration = useStore($durationSeconds);
  const speed = useStore($speed);

  if (!open || !track) return null;

  return (
    <div
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
          onChange={(e) => audioPlayerActions.seek(Number(e.target.value))}
          aria-label="Playback position"
          className={styles.scrubber}
        />
        <div className={styles.controlsRow}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => audioPlayerActions.seekRelative(-15)}
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
            onClick={() => audioPlayerActions.seekRelative(15)}
            aria-label="Forward 15 seconds"
          >
            +15s
          </button>
        </div>

        <div className={styles.speedRow}>
          {SPEEDS.map((s) => (
            <button
              type="button"
              key={s}
              className={styles.speedButton}
              onClick={() => audioPlayerActions.setSpeed(s)}
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
