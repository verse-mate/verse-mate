// VER-91 set the canonical web playback-speed list; VER-81 reuses it
// in the inline speed cycler so the full sheet and inline chip can
// never drift out of sync.
export const SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

export function nextSpeed(
  current: number,
  options: readonly number[] = SPEEDS,
): number {
  const idx = options.findIndex((s) => Math.abs(s - current) < 0.01);
  return idx === -1 ? options[0] : options[(idx + 1) % options.length];
}

export function formatSpeed(s: number): string {
  return `${s % 1 === 0 ? s.toFixed(0) : s}×`;
}
