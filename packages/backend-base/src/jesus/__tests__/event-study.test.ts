import { describe, expect, it } from "bun:test";

import {
  EVENT_STUDY_STEP_KINDS,
  distinctGospels,
  validateEventStudy,
} from "../utils/event-study";
import { referenceKey } from "../utils/generation-validation";
import { fillTemplate } from "../utils/template.utils";

/** The temple cleansing: four accounts, two settings. */
const allowed = [
  referenceKey("Matthew", 21),
  referenceKey("Mark", 11),
  referenceKey("Luke", 19),
  referenceKey("John", 2),
];
const sourceText = [
  "And Jesus entered the temple and drove out all those who were buying and selling in the temple,",
  "and He said to them, “It is written, ‘My house shall be called a house of prayer’; but you are making it a robbers’ den.”",
  "Jesus answered them, “Destroy this temple, and in three days I will raise it up.”",
].join(" ");

function validStudy() {
  return {
    themeOneLine: "My house shall be called a house of prayer",
    steps: [
      {
        number: 1,
        kind: "bullets",
        title: "Begin with prayer",
        summary: "",
        items: [{ tag: "POSTURE", text: "Read all four tellings." }],
      },
      {
        number: 2,
        kind: "qa",
        title: "Ask the 5 W's and an H",
        summary: "",
        items: [
          {
            tag: "WHERE",
            q: "Where?",
            a: "The temple (Mark 11:15; John 2:14).",
          },
        ],
      },
      {
        number: 3,
        kind: "keywords",
        title: "Key words",
        summary: "",
        inventory: [
          { word: "house", count: 3, verses: "Matthew 21:13; John 2:16" },
        ],
      },
      {
        number: 4,
        kind: "lists",
        title: "Make lists",
        summary: "",
        lists: [
          {
            title: "What Jesus does",
            columns: ["Verse", "Truth"],
            rows: [{ ref: "Luke 19:45", truth: "Drives out the sellers." }],
          },
        ],
      },
      {
        number: 5,
        kind: "contrasts",
        title: "Contrasts",
        summary: "",
        items: [
          {
            verses: "Matthew 21:13 · John 2:16",
            type: "Comparison",
            pairing:
              "A robbers' den in Matthew, a house of merchandise in John.",
          },
        ],
      },
      {
        number: 6,
        kind: "bullets",
        title: "Time",
        summary: "",
        items: [{ tag: "John 2:13", text: "Passover." }],
      },
      {
        number: 7,
        kind: "bullets",
        title: "Places",
        summary: "",
        items: [{ tag: "Mark 11:15", text: "Jerusalem." }],
      },
      {
        number: 8,
        kind: "bullets",
        title: "Conclusions",
        summary: "",
        items: [{ tag: "Luke 19:47", text: "They sought to destroy Him." }],
      },
      {
        number: 9,
        kind: "segments",
        title: "Theme",
        summary: "",
        themeHeadline: "The Lord comes to His temple",
        segments: [
          {
            title: "Cleansed",
            body: "As Isaiah 56:7 said, a house of prayer.",
          },
        ],
      },
    ],
    interpretation: {
      movements: [
        {
          title: "Two settings",
          range: "John 2:13-22",
          body: 'John places it at the first Passover: "Destroy this temple, and in three days I will raise it up."',
        },
      ],
    },
    application: {
      questions: [
        { range: "Mark 11:17", question: "What is His house for?" },
        { range: "John 2:19", question: "What temple did He mean?" },
        { range: "Luke 19:47", question: "Who opposed Him, and why?" },
      ],
    },
  };
}

const run = (study: unknown, raw?: string) =>
  validateEventStudy({
    content: raw ?? JSON.stringify(study),
    eventTitle: "Cleansing the temple",
    allowedReferences: allowed,
    sourceText,
  });

describe("validateEventStudy", () => {
  it("accepts a well-formed study and fills its header from the event", () => {
    const { study, issues } = run(validStudy());
    expect(issues).toEqual([]);
    expect(study?.title).toBe("Cleansing the temple");
    expect(study?.subtitle).toBe("The Precept Method, Across the Gospels");
    expect(study?.steps.map((s) => s.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(study?.interpretation.movements[0].number).toBe(1);
  });

  it("accepts JSON wrapped in a code fence", () => {
    const { issues } = run(
      null,
      `\`\`\`json\n${JSON.stringify(validStudy())}\n\`\`\``,
    );
    expect(issues).toEqual([]);
  });

  it("rejects unparseable output", () => {
    const { study, issues } = run(null, '{"steps": [');
    expect(study).toBeNull();
    expect(issues[0].rule).toBe("json");
  });

  it("requires all nine steps, each of its fixed kind", () => {
    const missing = validStudy();
    missing.steps = missing.steps.filter((s) => s.number !== 4);
    expect(run(missing).issues.map((i) => i.detail)).toContain(
      "missing step 4",
    );

    const wrongKind = validStudy();
    (wrongKind.steps[2] as { kind: string }).kind = "prose";
    expect(
      run(wrongKind).issues.some((i) => i.detail.startsWith("step 3 must be")),
    ).toBe(true);
    expect(Object.keys(EVENT_STUDY_STEP_KINDS)).toHaveLength(9);
  });

  it("requires the fields each step's card renders", () => {
    const study = validStudy();
    (study.steps[2] as { inventory: unknown[] }).inventory = [
      { word: "house" },
    ];
    expect(
      run(study).issues.some((i) => i.detail.includes('missing "verses"')),
    ).toBe(true);
  });

  it("requires movements and at least three application questions", () => {
    const study = validStudy();
    study.interpretation.movements = [];
    study.application.questions = study.application.questions.slice(0, 1);
    const details = run(study).issues.map((i) => i.detail);
    expect(details).toContain("interpretation needs at least one movement");
    expect(details).toContain("application needs at least 3 questions");
  });

  it("keeps Gospel references inside the event but lets other scripture be cited", () => {
    const stray = validStudy();
    stray.application.questions[0].range = "Mark 12:10";
    const issues = run(stray).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("reference-scope");
    expect(issues[0].detail).toContain("Mark 12");
    // Isaiah 56:7 in step 9 is not an issue in the valid study.
    expect(run(validStudy()).issues).toEqual([]);
  });

  it("rejects a quotation that is not in the event's passages", () => {
    const study = validStudy();
    study.interpretation.movements[0].body =
      'He said "I will build my temple of living stones" here.';
    const issues = run(study).issues;
    expect(issues.map((i) => i.rule)).toEqual(["quotation-grounded"]);
  });
});

describe("distinctGospels", () => {
  it("counts each Gospel once, ignoring non-Gospel books", () => {
    expect(
      distinctGospels([
        { book_name: "Matthew" },
        { book_name: "Matthew" },
        { book_name: "John" },
        { book_name: "Psalms" },
      ]),
    ).toBe(2);
    expect(distinctGospels([{ book_name: "Luke" }])).toBe(1);
  });
});

describe("the study template's JSON example", () => {
  it("survives fillTemplate untouched", () => {
    const template =
      '{event_title}: {"steps": [{"number": 1, "kind": "bullets"}]}';
    expect(fillTemplate(template, { event_title: "X" })).toBe(
      'X: {"steps": [{"number": 1, "kind": "bullets"}]}',
    );
  });
});
