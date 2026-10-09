import { describe, expect, it } from "bun:test";

import { CoachScoringService } from "./coach-scoring.service";
import {
  type TimedLine,
  checkQuoteAt,
  formatTimestamp,
  timedLinesFrom,
} from "./coach-transcript";

const LINES: TimedLine[] = [
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Welcome back, everyone.",
    startTime: 3.4,
  },
  {
    speakerId: "speaker-2",
    isLeader: false,
    text: "I have to say, I haven't prayed in weeks and it scares me.",
    startTime: 754.9,
  },
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Let's turn to verse four.",
    startTime: 3725,
  },
];

describe("timed transcript (task 5.18)", () => {
  it("the model sees each line with the time it was said", () => {
    const message = CoachScoringService.transcriptMessage(LINES);
    expect(message).toContain("[00:00:03] LEADER: Welcome back, everyone.");
    expect(message).toContain(
      "[00:12:34] speaker-2: I have to say, I haven't prayed in weeks and it scares me.",
    );
    expect(message).toContain("[01:02:05] LEADER: Let's turn to verse four.");
  });

  it("a line with no time is shown without one rather than with a made-up one", () => {
    const message = CoachScoringService.transcriptMessage([
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "hello",
        startTime: null,
      },
    ]);
    expect(message).toContain("\nLEADER: hello\n");
  });

  it("provider sentences carry their start time into the timed lines", () => {
    const sentence = {
      index: 0,
      speakerId: "speaker-1",
      isLeader: true,
      text: "hi",
      start_time: 12.7,
      end_time: 14,
    };
    expect(timedLinesFrom([sentence])).toEqual([
      { speakerId: "speaker-1", isLeader: true, text: "hi", startTime: 12.7 },
    ]);
  });

  it("formats seconds as hh:mm:ss, rounding down", () => {
    expect(formatTimestamp(0)).toBe("00:00:00");
    expect(formatTimestamp(754.9)).toBe("00:12:34");
    expect(formatTimestamp(3725)).toBe("01:02:05");
  });
});

describe("A key moment's quote is not in the transcript", () => {
  it("a verbatim quote at the time of its line is accepted", () => {
    expect(
      checkQuoteAt(LINES, "I haven't prayed in weeks", "00:12:34"),
    ).toBeNull();
  });

  it("accepts the timestamp in brackets or as minutes and seconds", () => {
    expect(
      checkQuoteAt(LINES, "I haven't prayed in weeks", "[00:12:34]"),
    ).toBeNull();
    expect(
      checkQuoteAt(LINES, "I haven't prayed in weeks", "12:34"),
    ).toBeNull();
  });

  it("ignores case, spacing and curly quotes when finding the quote", () => {
    expect(
      checkQuoteAt(LINES, "i HAVEN’T   prayed in weeks", "00:12:34"),
    ).toBeNull();
  });

  it("a quote that is not in the transcript is rejected", () => {
    expect(checkQuoteAt(LINES, "I stopped reading my Bible", "00:12:34")).toBe(
      "quote-not-in-transcript",
    );
  });

  it("a quote whose timestamp is not the time of its line is rejected", () => {
    expect(checkQuoteAt(LINES, "I haven't prayed in weeks", "00:12:40")).toBe(
      "timestamp-not-at-quote",
    );
    expect(checkQuoteAt(LINES, "I haven't prayed in weeks", "00:00:03")).toBe(
      "timestamp-not-at-quote",
    );
  });

  it("a quote running across two lines takes the time of the line it begins on", () => {
    expect(
      checkQuoteAt(LINES, "it scares me. Let's turn to verse four", "00:12:34"),
    ).toBeNull();
    expect(
      checkQuoteAt(LINES, "it scares me. Let's turn to verse four", "01:02:05"),
    ).toBe("timestamp-not-at-quote");
  });

  it("allows a speaker prefix on the transcript line", () => {
    const prefixed: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: false,
        text: "Speaker 3: we start Ruth today",
        startTime: 61,
      },
    ];
    expect(
      checkQuoteAt(prefixed, "we start Ruth today", "00:01:01"),
    ).toBeNull();
    expect(
      checkQuoteAt(LINES, "speaker-2: I haven't prayed in weeks", "00:12:34"),
    ).toBeNull();
    expect(
      checkQuoteAt(LINES, "LEADER: Let's turn to verse four", "01:02:05"),
    ).toBeNull();
  });

  it("an unreadable timestamp or an empty quote is rejected", () => {
    expect(checkQuoteAt(LINES, "I haven't prayed in weeks", "soon")).toBe(
      "timestamp-not-at-quote",
    );
    expect(checkQuoteAt(LINES, "   ", "00:12:34")).toBe(
      "quote-not-in-transcript",
    );
  });

  it("a line with no recorded time cannot anchor a moment", () => {
    const untimed: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "we start Ruth today",
        startTime: null,
      },
    ];
    expect(checkQuoteAt(untimed, "we start Ruth today", "00:00:00")).toBe(
      "timestamp-not-at-quote",
    );
  });
});
