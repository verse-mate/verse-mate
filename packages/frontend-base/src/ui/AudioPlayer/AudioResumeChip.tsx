/**
 * TASK-008: "Resume at mm:ss" chip shown beside Play when a stored
 * position exists. Clicking Resume seeks + plays; Restart starts from 0.
 *
 * Styling: CSS modules + open-props.
 */
import { audioPlayerActions } from "../../hooks/useAudioPlayerStore";
import type { ResumeProgress } from "../../hooks/useAudioProgress";
import styles from "./audio-player.module.css";

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
    <div className={styles.resumeChip}>
      <button
        type="button"
        className={styles.resumeButton}
        onClick={() => {
          audioPlayerActions.seekToResumePosition(progress.position_seconds);
          audioPlayerActions.play();
          props.onResume?.(progress);
          props.onPlaybackStartedCallback?.({
            isResume: true,
            resumePositionSeconds: progress.position_seconds,
          });
        }}
      >
        Resume at {formatTime(progress.position_seconds)}
      </button>
      <button
        type="button"
        className={styles.restartButton}
        onClick={() => {
          audioPlayerActions.seek(0);
          audioPlayerActions.play();
          props.onRestart?.();
          props.onPlaybackStartedCallback?.({ isResume: false });
        }}
      >
        Restart
      </button>
    </div>
  );
}
