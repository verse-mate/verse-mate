/**
 * TASK-007: persistent dock bar at the bottom of the viewport. Full-
 * width; content capped at 1200px. Keyboard: Space toggles play/pause
 * when focus is inside the player region.
 *
 * Styling: CSS modules + open-props; no inline styles.
 */
import { useEffect } from "react";
import { Pause, Play, X } from "react-feather";
import {
  $currentTrack,
  $dockVisible,
  $durationSeconds,
  $elapsedSeconds,
  $playbackState,
  audioPlayerActions,
} from "../../hooks/useAudioPlayerStore";
import { useStore } from "../../utils/use-store";
import styles from "./audio-player.module.css";

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function AudioDockBar() {
  const track = useStore($currentTrack);
  const state = useStore($playbackState);
  const elapsed = useStore($elapsedSeconds);
  const duration = useStore($durationSeconds);
  const visible = useStore($dockVisible);

  // Auto-hide 3s after natural completion.
  useEffect(() => {
    if (state !== "ended") return;
    const timer = window.setTimeout(() => audioPlayerActions.close(), 3000);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Keyboard: Space toggles play/pause when focus is inside the player region.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('[data-testid="audio-player-root"]')) return;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (state === "playing") audioPlayerActions.pause();
      else audioPlayerActions.play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, state]);

  if (!visible || !track) return null;

  const progressPct = duration > 0 ? (elapsed / duration) * 100 : 0;
  const remaining = Math.max(0, duration - elapsed);

  return (
    <div
      data-testid="audio-dock-bar"
      role="toolbar"
      aria-label="Audio playback controls"
      className={styles.dockBar}
    >
      <div className={styles.dockInner}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() =>
            state === "playing"
              ? audioPlayerActions.pause()
              : audioPlayerActions.play()
          }
          aria-label={state === "playing" ? "Pause" : "Play"}
        >
          {state === "playing" ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          className={styles.dockBody}
          onClick={() => audioPlayerActions.openFullSheet()}
          aria-label={`Open full player: ${track.explanation_type}, chapter ${track.chapter_number}`}
        >
          <div className={styles.dockTitle}>
            {track.explanation_type} · Chapter {track.chapter_number}
          </div>
          <div
            role="progressbar"
            aria-valuenow={elapsed}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-label="Playback progress"
            className={styles.progressTrack}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className={styles.dockTimes}>
            {formatTime(elapsed)} · -{formatTime(remaining)}
          </div>
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => audioPlayerActions.close()}
          aria-label="Close audio player"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
