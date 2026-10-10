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
const SPEAKER_PREFIX = /^[^\s:.!?]+(?: [^\s:.!?]+){0,5}:\s*/;
const TIME_PREFIX = /^\[\d{1,2}(?::\d{2}){1,2}\]\s*/;
const WORD = /[\p{L}\p{N}']/u;

export function spokenText(line: string): string {
  const untimed = line.trim().replace(TIME_PREFIX, "");
  return untimed === line.trim()
    ? untimed
    : untimed.replace(SPEAKER_PREFIX, "");
}

function lineStartsOf(lines: TimedLine[], quote: string): number[] {
  const offsets: number[] = [];
  let joined = "";
  for (const line of lines) {
    offsets.push(joined.length);
    joined += `${normalized(line.text)} `;
  }
  const found: number[] = [];
  for (
    let at = joined.indexOf(quote);
    at >= 0;
    at = joined.indexOf(quote, at + 1)
  ) {
    const before = at === 0 ? "" : joined[at - 1];
    const after = joined[at + quote.length] ?? "";
    if ((before && WORD.test(before)) || (after && WORD.test(after))) continue;
    let index = 0;
    while (index + 1 < offsets.length && offsets[index + 1] <= at) index += 1;
    found.push(index);
  }
  return found;
}

export function checkQuoteAt(
  lines: TimedLine[],
  quote: string,
  timestamp: string,
): QuoteProblem | null {
  const wanted = normalized(spokenText(quote)).replace(QUOTE_EDGES, "");
  if (!wanted) return "quote-not-in-transcript";
  const found = lineStartsOf(lines, wanted);
  const starts =
    found.length > 0
      ? found
      : lineStartsOf(lines, wanted.replace(SPEAKER_PREFIX, ""));
  if (starts.length === 0) return "quote-not-in-transcript";
  const claimed = parseTimestamp(timestamp);
  const matches = starts.some((index) => {
    const said = lines[index].startTime;
    return said != null && claimed !== null && claimed === Math.floor(said);
  });
  return matches ? null : "timestamp-not-at-quote";
}
