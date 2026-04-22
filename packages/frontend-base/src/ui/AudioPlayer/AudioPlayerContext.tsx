/**
 * Internal Context for the audio player tree. Lets AudioPlayerRoot host
 * the always-on useAudioProgress instance (so periodic save +
 * beforeunload run for the entire playback lifecycle, not just while
 * the AudioFullSheet is open) while still letting the sheet read the
 * resume progress + invoke the consume/dismiss handlers.
 */
import { createContext, useContext } from "react";
import type { ResumeProgress } from "../../hooks/useAudioProgress";

export interface AudioPlayerContextValue {
  resumeProgress: ResumeProgress | null;
  consumeResume: () => ResumeProgress | null;
  dismissResume: () => void;
}

const noop = (): null => null;

export const AudioPlayerContext = createContext<AudioPlayerContextValue>({
  resumeProgress: null,
  consumeResume: noop,
  dismissResume: () => undefined,
});

export function useAudioPlayerContext(): AudioPlayerContextValue {
  return useContext(AudioPlayerContext);
}
