export interface TimedLine {
  speakerId: string;
  isLeader: boolean;
  text: string;
  startTime?: number | null;
}

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

const SPEAKER_PREFIX = /^[^\s:]{1,40}(?: \d{1,3})?:\s*/;
const TIME_PREFIX = /^\[\d{1,2}(?::\d{2}){1,2}\]\s*/;
const WORD = /[\p{L}\p{N}]+(?:['‘’ʼ][\p{L}\p{N}]+)*/gu;
const WORDS_PER_ALLOWED_DIFFERENCE = 5;

export function spokenText(line: string): string {
  const untimed = line.trim().replace(TIME_PREFIX, "");
  return untimed === line.trim()
    ? untimed
    : untimed.replace(SPEAKER_PREFIX, "");
}

interface Word {
  text: string;
  line: number;
  from: number;
  to: number;
}

interface Match {
  cost: number;
  first: number;
  last: number;
  distance: number;
}

export interface LocatedQuote {
  quote: string;
  startTime: number | null;
}

const SENTENCE_END = /^[.?!…]+/;
const CLAUSE_END = /^[.,;:?!…]+/;
const DOUBLE_QUOTE_MARKS = /["“”]/g;

function wordsOf(text: string, line = 0): Word[] {
  return [...text.normalize("NFC").matchAll(WORD)].map((m) => ({
    text: m[0].toLowerCase().replace(/[‘’ʼ]/g, "'"),
    line,
    from: m.index,
    to: m.index + m[0].length,
  }));
}

function bestMatch(
  lines: TimedLine[],
  said: Word[],
  quote: string[],
  claimed: number | null,
  allowed: number,
): Match | null {
  if (quote.length === 0) return null;
  let cost = said.map(() => 0).concat(0);
  let first = cost.map((_, j) => j);
  for (let i = 1; i <= quote.length; i++) {
    const nextCost = [i];
    const nextFirst = [0];
    for (let j = 1; j <= said.length; j++) {
      const same = quote[i - 1] === said[j - 1].text;
      const diagonal = cost[j - 1] + (same ? 0 : 1);
      const quoteWordMissing = cost[j] + 1;
      const extraSaidWord = nextCost[j - 1] + 1;
      if (
        (same ? diagonal <= quoteWordMissing : diagonal < quoteWordMissing) &&
        diagonal <= extraSaidWord
      ) {
        nextCost.push(diagonal);
        nextFirst.push(first[j - 1]);
      } else if (quoteWordMissing <= extraSaidWord) {
        nextCost.push(quoteWordMissing);
        nextFirst.push(first[j]);
      } else {
        nextCost.push(extraSaidWord);
        nextFirst.push(nextFirst[j - 1]);
      }
    }
    cost = nextCost;
    first = nextFirst;
  }
  let best: Match | null = null;
  for (let j = 1; j <= said.length; j++) {
    if (cost[j] > allowed || first[j] >= j) continue;
    const time = lines[said[first[j]].line].startTime;
    const distance =
      time == null
        ? Number.POSITIVE_INFINITY
        : claimed === null
          ? 0
          : Math.abs(time - claimed);
    if (
      !best ||
      cost[j] < best.cost ||
      (cost[j] === best.cost && distance < best.distance)
    )
      best = { cost: cost[j], first: first[j], last: j - 1, distance };
  }
  return best;
}

function passage(lines: TimedLine[], words: Word[]): string {
  const parts = new Map<number, { from: number; to: number }>();
  for (const word of words) {
    const part = parts.get(word.line);
    parts.set(word.line, { from: part?.from ?? word.from, to: word.to });
  }
  return [...parts]
    .map(([line, { from, to }], index, all) => {
      const text = lines[line].text.normalize("NFC");
      const after = index === all.length - 1 ? SENTENCE_END : CLAUSE_END;
      return text.slice(
        from,
        to + (text.slice(to).match(after)?.[0].length ?? 0),
      );
    })
    .join(" ")
    .replace(DOUBLE_QUOTE_MARKS, "");
}

export function locateQuote(
  lines: TimedLine[],
  quote: string,
  near = "",
): LocatedQuote | null {
  const said = lines.flatMap((line, index) => wordsOf(line.text, index));
  const claimed = parseTimestamp(near);
  const spoken = spokenText(quote);
  const unlabelled = spoken.replace(SPEAKER_PREFIX, "");
  const allowed = Math.floor(
    wordsOf(unlabelled).length / WORDS_PER_ALLOWED_DIFFERENCE,
  );
  const best = [...new Set([unlabelled, spoken])]
    .map((variant) =>
      bestMatch(
        lines,
        said,
        wordsOf(variant).map((w) => w.text),
        claimed,
        allowed,
      ),
    )
    .reduce<Match | null>(
      (a, b) =>
        !b
          ? a
          : !a ||
              b.cost < a.cost ||
              (b.cost === a.cost && b.distance < a.distance)
            ? b
            : a,
      null,
    );
  if (!best) return null;
  return {
    quote: passage(lines, said.slice(best.first, best.last + 1)),
    startTime: lines[said[best.first].line].startTime ?? null,
  };
}
