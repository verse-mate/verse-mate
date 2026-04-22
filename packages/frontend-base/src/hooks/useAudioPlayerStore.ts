/**
 * TASK-007: web audio player store.
 *
 * Single source of truth for the docked-hybrid player. One `<audio>`
 * element lives in AudioPlayerRoot; these nanostore atoms describe
 * what it's playing and how. All components read through
 * useStore(atom) and dispatch via the audioPlayerActions object.
 */
import { atom } from "nanostores";

export type AudioPlaybackState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface AudioTrack {
  audio_id: string;
  explanation_id: number;
  url: string;
  duration_seconds: number;
  voice: string;
  language_code: string;
  explanation_type: string;
  book_id: number;
  chapter_number: number;
  tts_provider: string;
  source_href: string;
}

export const $currentTrack = atom<AudioTrack | null>(null);
export const $playbackState = atom<AudioPlaybackState>("idle");
export const $elapsedSeconds = atom<number>(0);
export const $durationSeconds = atom<number>(0);
export const $speed = atom<number>(1);
export const $error = atom<string | null>(null);
export const $dockVisible = atom<boolean>(false);
export const $fullSheetOpen = atom<boolean>(false);

/**
 * Context for the next playing transition, consumed by AudioPlayerRoot
 * when it fires AUDIO_PLAYBACK_STARTED. Set by playFromResume() to mark
 * the next play as a Resume; defaults to non-resume otherwise.
 */
export interface PlayContext {
  isResume: boolean;
  resumePositionSeconds?: number;
}
export const $lastPlayContext = atom<PlayContext | null>(null);

/**
 * Non-React controller so tests + the portal can drive the same state.
 * audioElementRef is set by AudioPlayerRoot on mount.
 */
let audioElementRef: HTMLAudioElement | null = null;

export const audioPlayerActions = {
  _setAudioElement(el: HTMLAudioElement | null) {
    audioElementRef = el;
  },

  getAudioElement(): HTMLAudioElement | null {
    return audioElementRef;
  },

  load(track: AudioTrack) {
    $currentTrack.set(track);
    $playbackState.set("loading");
    $elapsedSeconds.set(0);
    $durationSeconds.set(track.duration_seconds);
    $error.set(null);
    $dockVisible.set(true);
    if (audioElementRef) {
      audioElementRef.src = track.url;
      audioElementRef.playbackRate = $speed.get();
      // br-audio-005: NEVER auto-play. Caller explicitly triggers .play().
    }
  },

  async play() {
    if (!audioElementRef || !$currentTrack.get()) return;
    if ($lastPlayContext.get() === null) {
      $lastPlayContext.set({ isResume: false });
    }
    try {
      await audioElementRef.play();
      $playbackState.set("playing");
    } catch (err) {
      $playbackState.set("error");
      $error.set(err instanceof Error ? err.message : String(err));
    }
  },

  /**
   * Resume-chip entry point: marks the next playing transition as a
   * resume so AUDIO_PLAYBACK_STARTED carries isResume=true.
   */
  async playFromResume(positionSeconds: number) {
    $lastPlayContext.set({
      isResume: true,
      resumePositionSeconds: positionSeconds,
    });
    this.seek(positionSeconds);
    await this.play();
  },

  pause() {
    if (!audioElementRef) return;
    audioElementRef.pause();
    $playbackState.set("paused");
  },

  seek(toSeconds: number) {
    if (!audioElementRef) return;
    audioElementRef.currentTime = toSeconds;
    $elapsedSeconds.set(toSeconds);
  },

  seekRelative(deltaSeconds: number) {
    if (!audioElementRef) return;
    const next = Math.max(
      0,
      Math.min(
        audioElementRef.duration || 0,
        audioElementRef.currentTime + deltaSeconds,
      ),
    );
    this.seek(next);
  },

  setSpeed(speed: number) {
    $speed.set(speed);
    if (audioElementRef) audioElementRef.playbackRate = speed;
  },

  close() {
    if (audioElementRef) {
      audioElementRef.pause();
      audioElementRef.removeAttribute("src");
      audioElementRef.load();
    }
    $currentTrack.set(null);
    $playbackState.set("idle");
    $dockVisible.set(false);
    $fullSheetOpen.set(false);
    $elapsedSeconds.set(0);
    $lastPlayContext.set(null);
  },

  _onTimeUpdate(currentTime: number) {
    $elapsedSeconds.set(currentTime);
  },

  _onDurationChange(duration: number) {
    $durationSeconds.set(duration);
  },

  _onEnded() {
    $playbackState.set("ended");
    // Consumers observe this and fire AUDIO_PLAYBACK_COMPLETED + auto-hide.
  },

  _onError(message: string) {
    $playbackState.set("error");
    $error.set(message);
  },

  openFullSheet() {
    $fullSheetOpen.set(true);
  },

  closeFullSheet() {
    $fullSheetOpen.set(false);
  },

  /**
   * TASK-008 resume hook calls this BEFORE play() to honor a saved
   * position. Kept on the store so the resume hook doesn't need the
   * audio element ref directly.
   */
  seekToResumePosition(seconds: number) {
    this.seek(seconds);
  },
};

/** Test-only: reset all atoms. */
export function _resetAudioPlayerStore() {
  $currentTrack.set(null);
  $playbackState.set("idle");
  $elapsedSeconds.set(0);
  $durationSeconds.set(0);
  $speed.set(1);
  $error.set(null);
  $dockVisible.set(false);
  $fullSheetOpen.set(false);
  $lastPlayContext.set(null);
  audioElementRef = null;
}
