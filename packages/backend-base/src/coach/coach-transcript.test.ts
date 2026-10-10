import { describe, expect, it } from "bun:test";

import { CoachScoringService } from "./coach-scoring.service";
import {
  type TimedLine,
  formatTimestamp,
  locateQuote,
  spokenText,
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

const at = (lines: TimedLine[], quote: string, near = "") =>
  locateQuote(lines, quote, near)?.startTime;

describe("A quote found exactly takes the time of its line", () => {
  it("the line where the quote begins sets the time, whatever time the model gave", () => {
    expect(locateQuote(LINES, "I haven't prayed in weeks", "00:12:40")).toEqual(
      {
        quote: "I haven't prayed in weeks",
        startTime: 754.9,
      },
    );
    expect(at(LINES, "I haven't prayed in weeks", "00:00:03")).toBe(754.9);
    expect(at(LINES, "I haven't prayed in weeks")).toBe(754.9);
  });

  it("ignores case, spacing, punctuation and curly quotes", () => {
    expect(at(LINES, "i HAVEN’T   prayed in weeks")).toBe(754.9);
    expect(at(LINES, "I have to say I haven't prayed, in weeks!")).toBe(754.9);
    expect(at(LINES, '"welcome back everyone"')).toBe(3.4);
  });

  it("a fragment cut from the middle of words is not a quote", () => {
    expect(locateQuote(LINES, "aven't pray", "00:12:34")).toBeNull();
  });

  it("a quote that is not in the transcript is not located", () => {
    expect(
      locateQuote(LINES, "I stopped reading my Bible", "00:12:34"),
    ).toBeNull();
    expect(locateQuote(LINES, "   ", "00:12:34")).toBeNull();
  });

  it("allows a speaker label on the transcript line or before the quote", () => {
    const prefixed: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: false,
        text: "Speaker 3: we start Ruth today",
        startTime: 61,
      },
    ];
    expect(at(prefixed, "we start Ruth today")).toBe(61);
    expect(at(LINES, "speaker-2: I haven't prayed in weeks")).toBe(754.9);
    expect(at(LINES, "LEADER: Let's turn to verse four")).toBe(3725);
    expect(at(LINES, "[01:02:05] LEADER: Let's turn to verse four")).toBe(3725);
  });

  it("the stored quote is the transcript's words, never the label or time in front of the model's quote", () => {
    expect(
      locateQuote(LINES, "[00:12:34] speaker-2: I haven't prayed in weeks")
        ?.quote,
    ).toBe("I haven't prayed in weeks");
    expect(
      locateQuote(LINES, "speaker-2: i haven’t prayed in weeks")?.quote,
    ).toBe("I haven't prayed in weeks");
  });

  it("a provider's speaker name on the line is left out of the stored quote", () => {
    const labelled: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "Dan: we start Ruth today",
        startTime: 61,
      },
    ];
    expect(locateQuote(labelled, "Dan: we start Ruth today")).toEqual({
      quote: "we start Ruth today",
      startTime: 61,
    });
  });

  it("a passage cut inside quotation marks keeps no unpaired mark", () => {
    const said: TimedLine[] = [
      {
        speakerId: "s1",
        isLeader: true,
        text: 'He said "go now" and left the room',
        startTime: 5,
      },
    ];
    expect(locateQuote(said, "go now and left the room")?.quote).toBe(
      "go now and left the room",
    );
    expect(locateQuote(said, "He said go now")?.quote).toBe("He said go now");
  });

  it("a speaker label does not count towards the words that may differ", () => {
    const labelled: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "Dan: we start Ruth today",
        startTime: 61,
      },
    ];
    expect(locateQuote(labelled, "Dan: we start Ruth now")).toBeNull();
    expect(locateQuote(labelled, "Speaker 1: we start Ruth now")).toBeNull();
  });

  it("composed and decomposed accents are the same letters", () => {
    const accented: TimedLine[] = [
      {
        speakerId: "s1",
        isLeader: false,
        text: "Jose\u0301 read the passage aloud",
        startTime: 42,
      },
    ];
    expect(at(accented, "Jos\u00e9 read the passage")).toBe(42);
  });

  it("a line with no recorded time locates the quote without a time", () => {
    const untimed: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "we start Ruth today",
        startTime: null,
      },
    ];
    expect(locateQuote(untimed, "we start Ruth today", "00:00:00")).toEqual({
      quote: "we start Ruth today",
      startTime: null,
    });
  });
});

describe("A quote spanning two transcript lines", () => {
  it("keeps the punctuation where the lines join", () => {
    expect(
      locateQuote(LINES, "it scares me. Let's turn to verse four")?.quote,
    ).toBe("it scares me. Let's turn to verse four.");
  });

  it("takes the time of the line it begins on", () => {
    expect(
      at(LINES, "it scares me. Let's turn to verse four", "01:02:05"),
    ).toBe(754.9);
  });

  it("a sentence speech-to-text split across segments is found as one quote", () => {
    const segments: TimedLine[] = [
      {
        speakerId: "speaker",
        isLeader: false,
        text: "Thank you, Lina, so before I say anything,",
        startTime: 36.76,
      },
      {
        speakerId: "speaker",
        isLeader: false,
        text: "what jumps out at you in those 3 verses?",
        startTime: 41.2,
      },
    ];
    expect(
      at(
        segments,
        "so before I say anything, what jumps out at you",
        "00:00:41",
      ),
    ).toBe(36.76);
  });
});

describe("A repeated quote takes the occurrence nearest the model's time", () => {
  const twice: TimedLine[] = [
    { speakerId: "s1", isLeader: true, text: "Let's pray.", startTime: 60 },
    { speakerId: "s2", isLeader: false, text: "Amen.", startTime: 70 },
    { speakerId: "s1", isLeader: true, text: "Let's pray.", startTime: 3000 },
  ];

  it("the occurrence nearest the given time wins", () => {
    expect(at(twice, "Let's pray", "00:49:10")).toBe(3000);
    expect(at(twice, "Let's pray", "00:01:30")).toBe(60);
  });

  it("the first occurrence when the model gave no time it could read", () => {
    expect(at(twice, "Let's pray")).toBe(60);
    expect(at(twice, "Let's pray", "soon")).toBe(60);
  });

  it("reads the model's time in brackets or as minutes and seconds", () => {
    expect(at(twice, "Let's pray", "[00:49:10]")).toBe(3000);
    expect(at(twice, "Let's pray", "49:10")).toBe(3000);
  });

  it("an occurrence with a recorded time is preferred over one without", () => {
    const untimedFirst: TimedLine[] = [
      { speakerId: "s1", isLeader: true, text: "Let's pray.", startTime: null },
      { speakerId: "s1", isLeader: true, text: "Let's pray.", startTime: 50 },
    ];
    expect(at(untimedFirst, "Let's pray")).toBe(50);
    expect(at(untimedFirst, "Let's pray", "00:00:01")).toBe(50);
  });
});

describe("A quote found approximately is replaced by the transcript's words", () => {
  const segments: TimedLine[] = [
    {
      speakerId: "speaker",
      isLeader: false,
      text: "So my question for you is, where in your own week",
      startTime: 85.1,
    },
    {
      speakerId: "speaker",
      isLeader: false,
      text: "do you notice yourself heading for Tarshish?",
      startTime: 89.6,
    },
  ];

  it("one word in five may differ, and the stored quote becomes the transcript's words", () => {
    expect(
      locateQuote(
        segments,
        "where in your own week do you find yourself heading for Tarshish?",
        "00:01:29",
      ),
    ).toEqual({
      quote:
        "where in your own week do you notice yourself heading for Tarshish?",
      startTime: 85.1,
    });
    expect(
      locateQuote(
        segments,
        "where in your week do you notice yourself heading to Tarshish",
      )?.quote,
    ).toBe(
      "where in your own week do you notice yourself heading for Tarshish?",
    );
  });

  it("more than one word in five is not located", () => {
    expect(
      locateQuote(
        segments,
        "where in our own lives do we notice ourselves heading for Tarshish",
      ),
    ).toBeNull();
  });

  it("an extra first word in the quote does not pull in the previous line", () => {
    const lines: TimedLine[] = [
      {
        speakerId: "s1",
        isLeader: false,
        text: "Okay, thank you.",
        startTime: 10,
      },
      {
        speakerId: "s2",
        isLeader: true,
        text: "where in your own week do you notice yourself heading for Tarshish?",
        startTime: 15,
      },
    ];
    expect(
      locateQuote(
        lines,
        "So where in your own week do you notice yourself heading for Tarshish",
      ),
    ).toEqual({
      quote:
        "where in your own week do you notice yourself heading for Tarshish?",
      startTime: 15,
    });
  });

  it("the nearest occurrence wins among approximate matches, and an exact match beats a nearer approximate one", () => {
    const twice: TimedLine[] = [
      {
        speakerId: "s1",
        isLeader: true,
        text: "where in your own week do you notice yourself heading for Tarshish",
        startTime: 60,
      },
      {
        speakerId: "s1",
        isLeader: true,
        text: "where in your own week do you see yourself heading for Tarshish",
        startTime: 3000,
      },
    ];
    const changed =
      "where in your own week do you find yourself heading for Tarshish";
    expect(at(twice, changed, "00:49:00")).toBe(3000);
    expect(at(twice, changed, "00:01:00")).toBe(60);
    expect(
      at(
        twice,
        "where in your own week do you notice yourself heading for Tarshish",
        "00:50:00",
      ),
    ).toBe(60);
  });

  it("a quote of four words or fewer must be exact", () => {
    expect(locateQuote(LINES, "turn to chapter four")).toBeNull();
    expect(locateQuote(LINES, "Welcome back, everybody")).toBeNull();
  });
});

describe("scripture references and colons in quoted words", () => {
  it("a stamped line keeps a scripture reference whole when it has no speaker label", () => {
    expect(spokenText("[00:01:00] Turn with me to John 3:16")).toBe(
      "Turn with me to John 3:16",
    );
  });

  it("a stamped line with the recording bot's speaker label loses only the label", () => {
    expect(spokenText("[00:01:00] speaker-2: Turn with me to John 3:16")).toBe(
      "Turn with me to John 3:16",
    );
  });

  it("a misquote that happens to end in a scripture reference is not in the transcript", () => {
    const lines: TimedLine[] = [
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "Let us pray together now.",
        startTime: 10,
      },
      {
        speakerId: "speaker-1",
        isLeader: true,
        text: "Turn with me to John 3:16 please.",
        startTime: 20,
      },
    ];
    expect(locateQuote(lines, "Read with me John 3:16", "00:00:20")).toBeNull();
    expect(
      locateQuote(
        lines,
        "Marcus Reed the elder told us: let us pray together now",
        "00:00:10",
      ),
    ).toBeNull();
  });
});
