/**
 * TASK-008: "Resume at mm:ss" chip shown beside Play when a stored
 * position exists. Clicking Resume seeks + plays via the store's
 * playFromResume action so AudioPlayerRoot can mark the resulting
 * AUDIO_PLAYBACK_STARTED event with isResume=true (br-audio-014).
 *
 * Restart starts from 0 — analytics flows through the same
 * STARTED-on-transition path with isResume=false.
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
}

export function AudioResumeChip(props: AudioResumeChipProps) {
  const { progress } = props;
  return (
    <div className={styles.resumeChip}>
      <button
        type="button"
        className={styles.resumeButton}
        onClick={() => {
          audioPlayerActions.playFromResume(progress.position_seconds);
          props.onResume?.(progress);
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
        }}
      >
        Restart
      </button>
    </div>
  );
}
