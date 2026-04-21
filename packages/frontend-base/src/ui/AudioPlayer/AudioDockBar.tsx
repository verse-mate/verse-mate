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
/**
 * TASK-007: persistent dock bar.
 *
 * Visible while a track is loaded. Full-viewport width, centered content
 * at 1200px max. Tap body → full sheet; tap Play/Pause/Close → controls.
 */
import { useStore } from "../../utils/use-store";

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

  // Keyboard: Space toggles play/pause when focus is in the player region.
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
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "0.75rem 1rem",
        display: "flex",
        justifyContent: "center",
        background: "var(--color-surface, #fff)",
        borderTop: "1px solid var(--color-border, #eee)",
        zIndex: 40,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <button
          type="button"
          onClick={() =>
            state === "playing"
              ? audioPlayerActions.pause()
              : audioPlayerActions.play()
          }
          aria-label={state === "playing" ? "Pause" : "Play"}
          style={{ minWidth: 44, minHeight: 44 }}
        >
          {state === "playing" ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          onClick={() => audioPlayerActions.openFullSheet()}
          aria-label={`Open full player: ${track.explanation_type}, chapter ${track.chapter_number}`}
          style={{
            flex: 1,
            textAlign: "left",
            minHeight: 44,
            background: "transparent",
            border: 0,
          }}
        >
          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            {track.explanation_type} · Chapter {track.chapter_number}
          </div>
          <div
            role="progressbar"
            aria-valuenow={elapsed}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-label="Playback progress"
            style={{
              height: 4,
              background: "var(--color-border, #eee)",
              borderRadius: 2,
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: "var(--color-primary, #3b82f6)",
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--color-text-muted, #666)",
              marginTop: 2,
            }}
          >
            {formatTime(elapsed)} · -{formatTime(remaining)}
          </div>
        </button>
        <button
          type="button"
          onClick={() => audioPlayerActions.close()}
          aria-label="Close audio player"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
