import { describe, expect, it } from "bun:test";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import {
  BODY_SCORECARD,
  BODY_TRANSCRIPT,
  bodyAnswer,
} from "./coach-report-body.fixture";
import {
  type BodyInput,
  CoachReportBodyService,
  type ReportBody,
} from "./coach-report-body.service";
import { DIMENSIONS } from "./rubric";

class BodyAi implements AiProvider {
  readonly name = "fake";
  sent: AiChatOptions[] = [];
  constructor(private readonly answer: string) {}
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.sent.push(opts);
    return { content: this.answer, model: "fake" };
  }
  private unused(name: string): never {
    throw new Error(`BodyAi.${name} is not part of the body stage`);
  }
  responsesCreate = () => this.unused("responsesCreate");
  filesCreate = () => this.unused("filesCreate");
  filesRetrieve = () => this.unused("filesRetrieve");
  filesContent = () => this.unused("filesContent");
  batchesCreate = () => this.unused("batchesCreate");
  batchesRetrieve = () => this.unused("batchesRetrieve");
  batchesCancel = () => this.unused("batchesCancel");
}

const INPUT: BodyInput = {
  sessionTitle: "Jonah, Week 2",
  sessionDate: "2026-10-01",
  duration: "90 min",
  attendees: 12,
  newcomers: 1,
  transcript: BODY_TRANSCRIPT,
  dimensions: DIMENSIONS.map((d) => ({
    n: d.n,
    name: d.name,
    score: 4,
    note: `a reason for dimension ${d.n}`,
  })),
  firstLesson: false,
  history: null,
};

async function generate(
  overrides: Record<string, unknown> = {},
  input: Partial<BodyInput> = {},
) {
  const ai = new BodyAi(bodyAnswer(overrides));
  const result = await new CoachReportBodyService(ai).generate({
    ...INPUT,
    ...input,
  });
  return { ...result, ai };
}

function section(body: ReportBody, title: RegExp) {
  return body.sections.find((s) => title.test(s.title));
}

function rows(body: ReportBody): string[] {
  return body.sections
    .filter((s) => /^Scorecard — Table/.test(s.title))
    .flatMap((s) => s.bullets ?? []);
}

describe("Machine Reports Carry The Full Report Body (task 6.10)", () => {
  it("A machine-scored report reads like a hand-written one", async () => {
    const { body, issues } = await generate();
    expect(issues).toEqual([]);
    expect(body.feedback.headline).toBe("A room that started to open up");
    expect(body.feedback.overview?.length).toBeGreaterThan(0);
    expect(body.bigIdeas.length).toBe(5);
    expect(body.feedback.strengths.length).toBe(5);
    expect(body.feedback.improvements.length).toBe(5);
    expect(body.feedback.recommendations.length).toBe(5);
    expect(body.feedback.strengthsProse?.[0]).toEqual({
      title: "Strength 1",
      paragraphs: [
        "One line about strength 1.",
        "A paragraph about strength 1.",
        "Evidence: “strength evidence 1” at 00:31:00",
      ],
    });
    expect(
      body.sections.filter((s) => /^Scorecard — Table \d$/.test(s.title))
        .length,
    ).toBe(8);
    expect(section(body, /^Application Questions$/)?.bullets).toEqual([
      "Why would the prophet run? — Level 3 — Reason/justify — Opened the room.",
      "Where are you running today? — Level 4 — Apply to life — Went personal.",
    ]);
    expect(section(body, /^Monologues$/)?.paragraphs?.[0]).toContain(
      "Ask the group what they know first.",
    );
    expect(section(body, /^Key Moments/)?.moments?.length).toBe(2);
    expect(body.keyMoments.map((m) => [m.quote, m.timestamp])).toEqual([
      ["I haven't prayed in weeks", "00:12:34"],
      ["Why would the prophet run the other way?", "00:20:10"],
    ]);
  });

  it("Report identifies its session: the title page rows in order, then the big ideas and a context line with no score", async () => {
    const { body } = await generate();
    expect(section(body, /^Session Details$/)).toEqual({
      title: "Session Details",
      bullets: [
        "Date: 2026-10-01",
        "Session: Jonah, Week 2",
        "Topic: The call of the reluctant prophet",
        "Duration: 90 min",
        "Location: Fellowship hall",
        "Attendees: 12",
        "Newcomers: 1",
        "Mentor Present: Yes",
        "Books Studied: Jonah 1",
      ],
      paragraphs: [
        "An honest session where a hard confession changed the room.",
      ],
    });
    expect(body.sections[0].title).toBe("Session Details");
    expect(body.contextLine).toBe(
      "An honest session where a hard confession changed the room.",
    );
  });

  it("The transcript never states the location: no location row, rather than a guessed one", async () => {
    const { body } = await generate({ location: null, booksStudied: "" });
    const details = section(body, /^Session Details$/)?.bullets ?? [];
    expect(details.some((r) => r.startsWith("Location"))).toBe(false);
    expect(details.some((r) => r.startsWith("Books Studied"))).toBe(false);
  });

  it("a session title over 80 characters is cut to 80 on the title page", async () => {
    const { body } = await generate({}, { sessionTitle: "x".repeat(120) });
    expect(section(body, /^Session Details$/)?.bullets?.[1]).toBe(
      `Session: ${"x".repeat(80)}`,
    );
  });

  it("a mentor absent keeps the reason to eight words", async () => {
    const { body } = await generate({
      mentorPresent:
        "No — out of town this week visiting his daughter in another state",
    });
    expect(
      section(body, /^Session Details$/)?.bullets?.find((r) =>
        r.startsWith("Mentor"),
      ),
    ).toBe("Mentor Present: No — out of town this week visiting his daughter");
  });

  it("Scorecard rates against a target: each row shows the value, the target and a rating", async () => {
    const { body } = await generate();
    expect(rows(body)).toContain(
      "Leader Talk (incl. reading): 62% / 38%  (Target: 30% audience)  → NEEDS WORK",
    );
    const { issues } = await generate({
      scorecard: BODY_SCORECARD.map((t, i) =>
        i === 4 ? { ...t, rows: [{ ...t.rows[0], rating: "GREAT" }] } : t,
      ),
    });
    expect(issues.join(" ")).toContain("scorecard");
  });

  it("Talk ratio is reported with and without scripture reading: a scorecard missing either is incomplete", async () => {
    const { issues } = await generate({
      scorecard: BODY_SCORECARD.map((t, i) =>
        i === 1 ? { ...t, rows: [t.rows[0]] } : t,
      ),
    });
    expect(issues.join(" ")).toMatch(/talk ratio/i);
  });

  it("Monologue detail is separated from its count: the leadership table keeps the count only", async () => {
    const { body } = await generate();
    expect(rows(body).some((r) => r.startsWith("Monologue details"))).toBe(
      false,
    );
    expect(rows(body)).toContain(
      "Monologues >90 sec: 2  (Target: ≤2)  → ON TARGET",
    );
  });

  it("A first lesson drops the Big Ideas review row, and the other rows of that table stay", async () => {
    const { body, issues } = await generate({}, { firstLesson: true });
    expect(issues).toEqual([]);
    expect(rows(body).some((r) => /^Big Ideas review/i.test(r))).toBe(false);
    expect(rows(body)).toContain(
      "Overall Class Time: 1h 30m  (Target: 1.5-2h)  → ON TARGET",
    );
  });

  it("A first lesson gets no cold-recall improvement: one in the body is incomplete", async () => {
    const answer = JSON.parse(bodyAnswer()) as { improvements: unknown[] };
    const { issues } = await generate(
      {
        improvements: [
          {
            title: "Open with a cold recall of last week's big ideas",
            line: "Start with recall.",
            paragraphs: ["Recall."],
            quote: "recall evidence",
            timestamp: "00:44:00",
          },
          ...answer.improvements.slice(1),
        ],
      },
      { firstLesson: true },
    );
    expect(issues.join(" ")).toMatch(/cold-recall/);
  });

  it("A generated section is incomplete: an empty headline, no big ideas, four strengths or an improvement with no evidence", async () => {
    const answer = JSON.parse(bodyAnswer()) as {
      strengths: unknown[];
      improvements: Array<Record<string, unknown>>;
    };
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ headline: " " }, /headline/],
      [{ bigIdeas: [] }, /big ideas/],
      [{ strengths: answer.strengths.slice(0, 4) }, /strengths/],
      [
        {
          improvements: [
            { ...answer.improvements[0], quote: "" },
            ...answer.improvements.slice(1),
          ],
        },
        /improvements/,
      ],
      [{ recommendations: [] }, /recommendations/],
      [{ questions: [{ question: "q", level: 7 }] }, /questions/],
      [{ summaryLine: "" }, /context line/],
      [{ summaryLine: "Scored 78.1 / 100 this week" }, /context line/],
      [
        { bigIdeas: ["one", "two", "three", "four", "five", "six", "seven"] },
        /big ideas/,
      ],
    ];
    for (const [override, named] of cases) {
      const { issues } = await generate(override);
      expect(issues.join(" ")).toMatch(named);
    }
  });

  it("each strength and improvement keeps its evidence, and a quote the session never had is refused", async () => {
    const good = await generate({});
    expect(good.issues).toEqual([]);
    expect(good.body.feedback.strengthsProse[0].paragraphs).toContain(
      "Evidence: “strength evidence 1” at 00:31:00",
    );
    const answer = JSON.parse(bodyAnswer()) as {
      strengths: Array<Record<string, unknown>>;
    };
    const { issues } = await generate({
      strengths: [
        answer.strengths[0],
        { ...answer.strengths[1], quote: "words nobody said" },
        ...answer.strengths.slice(2),
      ],
    });
    expect(issues.join(" ")).toMatch(/strengths 2: quote-not-in-transcript/);
  });

  it("a very long transcript is cut for the model at the same bound scoring uses", async () => {
    const long = Array.from({ length: 3000 }, (_, i) => ({
      speakerId: "speaker-9",
      isLeader: false,
      text: "x".repeat(100),
      startTime: 2000 + i,
    }));
    const { ai } = await generate(
      {},
      { transcript: [...BODY_TRANSCRIPT, ...long] },
    );
    const said = ai.sent[0].messages.map((m) => m.content).join("\n");
    expect(said).toContain("[transcript truncated at 200000 characters]");
  });

  it("an answer that cannot be read is incomplete, not a crash", async () => {
    const ai = new BodyAi("not json");
    const { issues } = await new CoachReportBodyService(ai).generate(INPUT);
    expect(issues.join(" ")).toMatch(/could not be read/);
  });

  it("A key moment's quote is not in the transcript: the body is not accepted, naming the moment", async () => {
    const answer = JSON.parse(bodyAnswer()) as {
      keyMoments: Array<Record<string, unknown>>;
    };
    const { issues } = await generate({
      keyMoments: [{ ...answer.keyMoments[0], quote: "a line nobody said" }],
    });
    expect(issues.join(" ")).toContain(
      'key moment 1 ("A confession met with welcome"): its quote is not in the transcript',
    );
    const late = await generate({
      keyMoments: [{ ...answer.keyMoments[0], timestamp: "00:12:40" }],
    });
    expect(late.issues.join(" ")).toContain(
      "its timestamp is not the time of the line where the quote begins",
    );
  });

  it("A missed moment quotes its trigger and gives a concrete alternative: one without the alternative is incomplete", async () => {
    const { body } = await generate();
    const missed = section(body, /^Key Moments/)?.moments?.[1];
    expect(missed?.timestamp).toBe("[00:20:10]");
    expect(missed?.detail).toContain(
      "“Why would the prophet run the other way?”",
    );
    expect(missed?.detail).toContain(
      "What would have made it bigger: Ask: what would make you run the other way?",
    );
    const answer = JSON.parse(bodyAnswer()) as {
      keyMoments: Array<Record<string, unknown>>;
    };
    const { issues } = await generate({
      keyMoments: [{ ...answer.keyMoments[1], biggerAlternative: "" }],
    });
    expect(issues.join(" ")).toMatch(
      /key moment 1 .*what would have made it bigger/,
    );
  });

  it("A session with two moments that matter lists those two and no others", async () => {
    const { body } = await generate();
    expect(body.keyMoments.length).toBe(2);
  });

  it("more than five key moments is incomplete", async () => {
    const answer = JSON.parse(bodyAnswer()) as { keyMoments: unknown[] };
    const { issues } = await generate({
      keyMoments: [
        ...answer.keyMoments,
        ...answer.keyMoments,
        ...answer.keyMoments,
      ],
    });
    expect(issues.join(" ")).toMatch(/key moments: 6/);
  });

  it("A session with no key moment says so, and is held for an admin to confirm", async () => {
    const { body, issues } = await generate({ keyMoments: [] });
    expect(section(body, /^Key Moments/)?.paragraphs).toEqual([
      "No moment in this session qualified as a key moment.",
    ]);
    expect(issues).toEqual([
      "key moments: none qualified, confirm before delivery",
    ]);
  });

  it("a key moment's quote or timestamp used again in a strength or improvement is refused", async () => {
    const answer = JSON.parse(bodyAnswer()) as {
      strengths: Array<Record<string, unknown>>;
    };
    const { issues } = await generate({
      strengths: [
        { ...answer.strengths[0], quote: "I haven't prayed in weeks" },
        { ...answer.strengths[1], timestamp: "00:20:10" },
        ...answer.strengths.slice(2),
      ],
    });
    const said = issues.join(" ");
    expect(said).toContain('quote "I haven\'t prayed in weeks" is used twice');
    expect(said).toContain("timestamp 00:20:10 is used twice");
  });

  it("a cluster impact that claims a score change is refused: no score is changed", async () => {
    const answer = JSON.parse(bodyAnswer()) as {
      keyMoments: Array<Record<string, unknown>>;
    };
    const { issues } = await generate({
      keyMoments: [
        {
          ...answer.keyMoments[0],
          clusterImpact: "Being Real — captured: +0.5 on Vulnerability",
        },
      ],
    });
    expect(issues.join(" ")).toMatch(/cluster impact claims a score change/);
  });

  it("when every moment is one type, the section says so", async () => {
    const answer = JSON.parse(bodyAnswer()) as {
      keyMoments: Array<Record<string, unknown>>;
    };
    const { body } = await generate({ keyMoments: [answer.keyMoments[0]] });
    expect(section(body, /^Key Moments/)?.paragraphs).toEqual([
      "Every key moment in this session was capitalized.",
    ]);
  });

  it("the model is given the timed transcript, the title and the scores, and is told not to change them", async () => {
    const { ai } = await generate();
    const said = ai.sent[0].messages.map((m) => m.content).join("\n");
    expect(said).toContain("[00:12:34] speaker-2: I haven't prayed in weeks");
    expect(said).toContain("Jonah, Week 2");
    expect(said).toContain("Memory Reinforcement: 4");
    expect(ai.sent[0].messages[0].content).toBe(
      CoachReportBodyService.buildInstructions(),
    );
    expect(CoachReportBodyService.buildInstructions()).toMatch(
      /do not change any score/i,
    );
  });

  it("The benchmark leader's machine report compares with his history; any other leader's carries neither section", async () => {
    const history = [4, 4, 3, 5].map((s, i) => ({
      date: `2026-09-${String(10 + i).padStart(2, "0")}`,
      dimensions: DIMENSIONS.map((d) => ({
        n: d.n,
        score: d.n === 6 ? 2 : s,
      })),
    }));
    const { body } = await generate({}, { history });
    const sos = section(body, /^Session-Over-Session Comparison$/);
    expect(sos?.bullets).toContain(
      "Participant Engagement: 4 this session against 2 over the last 4 sessions ↑",
    );
    expect(sos?.bullets).toContain(
      "Session Structure & Flow: 4 this session against 4 over the last 4 sessions →",
    );
    expect(section(body, /^Drift Check$/)?.paragraphs?.[0]).toContain(
      "Participant Engagement",
    );
    const other = await generate({}, { history: null });
    expect(section(other.body, /^Session-Over-Session/)).toBeUndefined();
    expect(section(other.body, /^Drift Check$/)).toBeUndefined();
  });
});
