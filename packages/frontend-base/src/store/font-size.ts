import { atom } from "nanostores";

const STORAGE_KEY = "versemate-font-size";
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 13;
const MAX_FONT_SIZE = 26;

function loadFontSize(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (
        Number.isFinite(parsed) &&
        parsed >= MIN_FONT_SIZE &&
        parsed <= MAX_FONT_SIZE
      ) {
        return parsed;
      }
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_FONT_SIZE;
}

export const fontSizeStore = atom<number>(loadFontSize());

export function setFontSize(size: number) {
  const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
  fontSizeStore.set(clamped);
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    // localStorage not available
  }
}

export { DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE };
