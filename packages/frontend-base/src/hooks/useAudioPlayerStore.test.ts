/**
 * TASK-007 store unit tests — cover br-audio-005 (no auto-play), seek,
 * speed, close, error bubbling.
 *
 * We stub the <audio> element with a minimal fake. The store never
 * calls anything beyond currentTime / playbackRate / play / pause /
 * src / removeAttribute / load.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import {
  $currentTrack,
  $dockVisible,
  $elapsedSeconds,
  $error,
  $fullSheetOpen,
  $playbackState,
  $speed,
  type AudioTrack,
  _resetAudioPlayerStore,
  audioPlayerActions,
} from "./useAudioPlayerStore";

class FakeAudio {
  src = "";
  currentTime = 0;
  duration = 0;
  playbackRate = 1;
  playCount = 0;
  pauseCount = 0;
  playShouldReject = false;
  removedSrc = false;

  play() {
    this.playCount += 1;
    if (this.playShouldReject) return Promise.reject(new Error("play failed"));
    return Promise.resolve();
  }
  pause() {
    this.pauseCount += 1;
  }
  removeAttribute(name: string) {
    if (name === "src") {
      this.removedSrc = true;
      this.src = "";
    }
  }
  load() {
    /* no-op */
  }
}

const sampleTrack: AudioTrack = {
  audio_id: "a-1",
  explanation_id: 42,
  url: "https://cdn.test/audio.mp3",
  duration_seconds: 200,
  voice: "alloy",
  language_code: "en",
  explanation_type: "summary",
  book_id: 1,
  chapter_number: 1,
  tts_provider: "openai",
  source_href: "/bible/1/1",
};

// Minimal localStorage + window shim so the SSR-guarded persistence path
// in useAudioPlayerStore can be exercised under bun:test, which doesn't
// ship a DOM. Real browser behavior is covered by the runtime store; this
// shim only needs the getItem/setItem/removeItem surface.
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
const fakeStorage = new FakeStorage();
(globalThis as unknown as { window: { localStorage: FakeStorage } }).window = {
  localStorage: fakeStorage,
};

describe("audioPlayerStore", () => {
  let el: FakeAudio;

  beforeEach(() => {
    fakeStorage.clear();
    _resetAudioPlayerStore();
    el = new FakeAudio();
    audioPlayerActions._setAudioElement(el as unknown as HTMLAudioElement);
  });

  it("load: sets track + moves to 'loading' WITHOUT auto-play (br-audio-005)", () => {
    audioPlayerActions.load(sampleTrack);
    expect($currentTrack.get()?.audio_id).toBe("a-1");
    expect($playbackState.get()).toBe("loading");
    expect($dockVisible.get()).toBe(true);
    expect(el.src).toBe(sampleTrack.url);
    expect(el.playCount).toBe(0); // NOT auto-played
  });

  it("play → playing", async () => {
    audioPlayerActions.load(sampleTrack);
    await audioPlayerActions.play();
    expect($playbackState.get()).toBe("playing");
    expect(el.playCount).toBe(1);
  });

  it("play rejection bubbles to error state", async () => {
    audioPlayerActions.load(sampleTrack);
    el.playShouldReject = true;
    await audioPlayerActions.play();
    expect($playbackState.get()).toBe("error");
    expect($error.get()).toContain("play failed");
  });

  it("pause → paused", async () => {
    audioPlayerActions.load(sampleTrack);
    await audioPlayerActions.play();
    audioPlayerActions.pause();
    expect($playbackState.get()).toBe("paused");
    expect(el.pauseCount).toBe(1);
  });

  it("seek / seekRelative update position", () => {
    audioPlayerActions.load(sampleTrack);
    el.duration = 200;
    audioPlayerActions.seek(50);
    expect(el.currentTime).toBe(50);
    expect($elapsedSeconds.get()).toBe(50);

    audioPlayerActions.seekRelative(15);
    expect(el.currentTime).toBe(65);

    audioPlayerActions.seekRelative(-200); // clamps at 0
    expect(el.currentTime).toBe(0);
  });

  it("setSpeed syncs playbackRate", () => {
    audioPlayerActions.load(sampleTrack);
    audioPlayerActions.setSpeed(1.5);
    expect($speed.get()).toBe(1.5);
    expect(el.playbackRate).toBe(1.5);
  });

  it("setSpeed persists to localStorage (VER-91)", () => {
    audioPlayerActions.setSpeed(0.5);
    expect(fakeStorage.getItem("vm_audio_speed")).toBe("0.5");
    audioPlayerActions.setSpeed(1.5);
    expect(fakeStorage.getItem("vm_audio_speed")).toBe("1.5");
  });

  it("close: tears everything down", async () => {
    audioPlayerActions.load(sampleTrack);
    await audioPlayerActions.play();
    audioPlayerActions.close();
    expect($currentTrack.get()).toBeNull();
    expect($playbackState.get()).toBe("idle");
    expect($dockVisible.get()).toBe(false);
    expect($fullSheetOpen.get()).toBe(false);
    expect(el.removedSrc).toBe(true);
  });

  it("_onEnded → 'ended'", () => {
    audioPlayerActions.load(sampleTrack);
    audioPlayerActions._onEnded();
    expect($playbackState.get()).toBe("ended");
  });

  it("openFullSheet / closeFullSheet toggles atom", () => {
    audioPlayerActions.openFullSheet();
    expect($fullSheetOpen.get()).toBe(true);
    audioPlayerActions.closeFullSheet();
    expect($fullSheetOpen.get()).toBe(false);
  });
});
