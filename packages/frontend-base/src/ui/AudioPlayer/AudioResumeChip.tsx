/**
 * TASK-008: "Resume at mm:ss" chip shown beside Play when a stored
 * position exists. Clicking it seeks to the stored position and starts
 * playback.
 */
import { audioPlayerActions } from "../../hooks/useAudioPlayerStore";
import type { ResumeProgress } from "../../hooks/useAudioProgress";

function formatTime(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export interface AudioResumeChipProps {
  progress: ResumeProgress;
  onResume?: (progress: ResumeProgress) => void;
  onRestart?: () => void;
  /**
   * Analytics callback — fires with isResume=true when the user takes
   * the Resume branch, false when they Restart. Wired to
   * AUDIO_PLAYBACK_STARTED by the consumer.
   */
  onPlaybackStartedCallback?: (args: {
    isResume: boolean;
    resumePositionSeconds?: number;
  }) => void;
}

export function AudioResumeChip(props: AudioResumeChipProps) {
  const { progress } = props;
  return (
    <div
      className="audio-resume-chip"
      style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}
    >
      <button
        type="button"
        onClick={() => {
          audioPlayerActions.seekToResumePosition(progress.position_seconds);
          audioPlayerActions.play();
          props.onResume?.(progress);
          props.onPlaybackStartedCallback?.({
            isResume: true,
            resumePositionSeconds: progress.position_seconds,
          });
        }}
        style={{ minHeight: 44 }}
      >
        Resume at {formatTime(progress.position_seconds)}
      </button>
      <button
        type="button"
        onClick={() => {
          audioPlayerActions.seek(0);
          audioPlayerActions.play();
          props.onRestart?.();
          props.onPlaybackStartedCallback?.({ isResume: false });
        }}
        style={{ minHeight: 44 }}
      >
        Restart
      </button>
    </div>
  );
}
