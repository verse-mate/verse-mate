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
/**
 * TASK-007: full-screen player sheet. ±15s seek buttons, speed menu,
 * "Go to source" deep link. Opens from AudioDockBar tap.
 */
import { useStore } from "../../utils/use-store";

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
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-surface, #fff)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        padding: "2rem 1rem",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={() => audioPlayerActions.closeFullSheet()}
          aria-label="Close full player"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          <ChevronDown size={24} />
        </button>
        <a
          href={track.source_href}
          onClick={() => audioPlayerActions.closeFullSheet()}
          aria-label="Go to source explanation"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25em",
            minHeight: 44,
          }}
        >
          Go to source <ExternalLink size={16} />
        </a>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "1.5rem",
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {track.explanation_type}
          </div>
          <div style={{ color: "var(--color-text-muted, #666)" }}>
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
          style={{ width: "100%", maxWidth: 480 }}
        />
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => audioPlayerActions.seekRelative(-15)}
            aria-label="Rewind 15 seconds"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            -15s
          </button>
          <button
            type="button"
            onClick={() =>
              state === "playing"
                ? audioPlayerActions.pause()
                : audioPlayerActions.play()
            }
            aria-label={state === "playing" ? "Pause" : "Play"}
            style={{ minHeight: 60, minWidth: 60 }}
          >
            {state === "playing" ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button
            type="button"
            onClick={() => audioPlayerActions.seekRelative(15)}
            aria-label="Forward 15 seconds"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            +15s
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {SPEEDS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => audioPlayerActions.setSpeed(s)}
              aria-pressed={speed === s}
              style={{
                minHeight: 44,
                minWidth: 44,
                fontWeight: speed === s ? 700 : 400,
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        <div style={{ color: "var(--color-text-muted, #666)" }}>
          {formatTime(elapsed)} / {formatTime(duration)}
        </div>
      </main>
    </div>
  );
}
