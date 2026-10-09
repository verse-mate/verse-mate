export interface TimedLine {
  speakerId: string;
  isLeader: boolean;
  text: string;
  startTime?: number | null;
}

export type QuoteProblem = "quote-not-in-transcript" | "timestamp-not-at-quote";

export function timedLinesFrom(
  sentences: Array<{
    speakerId: string;
    isLeader: boolean;
    text: string;
    start_time: number | null;
  }>,
): TimedLine[] {
  return sentences.map((s) => ({
    speakerId: s.speakerId,
    isLeader: s.isLeader,
    text: s.text,
    startTime: s.start_time,
  }));
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function parseTimestamp(stamp: string): number | null {
  const match = stamp
    .trim()
    .replace(/^\[|\]$/g, "")
    .match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
  );
}

export function speakerLabel(line: TimedLine): string {
  return line.isLeader ? "LEADER" : line.speakerId;
}

export function renderLine(line: TimedLine): string {
  const said = `${speakerLabel(line)}: ${line.text}`;
  return line.startTime == null
    ? said
    : `[${formatTimestamp(line.startTime)}] ${said}`;
}

function normalized(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const QUOTE_EDGES = /^[\s"'.,;:!?…-]+|[\s"'.,;:!?…-]+$/g;
const SPEAKER_PREFIX = /^[^\s:]{1,40}(?: \d{1,3})?:\s*/;

function lineStartOf(lines: TimedLine[], quote: string): number | null {
  const offsets: number[] = [];
  let joined = "";
  for (const line of lines) {
    offsets.push(joined.length);
    joined += `${normalized(line.text)} `;
  }
  const at = joined.indexOf(quote);
  if (at < 0) return null;
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1] <= at) index += 1;
  return index;
}

export function checkQuoteAt(
  lines: TimedLine[],
  quote: string,
  timestamp: string,
): QuoteProblem | null {
  const wanted = normalized(quote).replace(QUOTE_EDGES, "");
  if (!wanted) return "quote-not-in-transcript";
  const index =
    lineStartOf(lines, wanted) ??
    lineStartOf(lines, wanted.replace(SPEAKER_PREFIX, ""));
  if (index === null) return "quote-not-in-transcript";
  const said = lines[index].startTime;
  const claimed = parseTimestamp(timestamp);
  if (said == null || claimed === null || claimed !== Math.floor(said))
    return "timestamp-not-at-quote";
  return null;
}
