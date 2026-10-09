import type { AiChatOptions } from "../shared/ai";
import { CoachReportBodyService } from "./coach-report-body.service";
import type { TimedLine } from "./coach-transcript";

export function isBodyCall(opts: AiChatOptions): boolean {
  return (
    opts.messages[0]?.content === CoachReportBodyService.buildInstructions()
  );
}

export const BODY_TRANSCRIPT: TimedLine[] = [
  { speakerId: "speaker-1", isLeader: true, text: "welcome", startTime: 0 },
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Let's open in prayer and then read the first chapter together.",
    startTime: 65,
  },
  {
    speakerId: "speaker-2",
    isLeader: false,
    text: "I haven't prayed in weeks and it scares me.",
    startTime: 754,
  },
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Thank you for saying that. Who else has felt that way?",
    startTime: 760,
  },
  {
    speakerId: "speaker-3",
    isLeader: false,
    text: "Why would the prophet run the other way?",
    startTime: 1210,
  },
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Let me tell you about the shipping routes of the time.",
    startTime: 1500,
  },
];

const ROW = (
  metric: string,
  value: string,
  target: string,
  rating: string,
) => ({
  metric,
  value,
  target,
  rating,
});

export const BODY_SCORECARD = [
  { table: "Attendees", rows: [ROW("Number of Attendees", "12", "—", "N/A")] },
  {
    table: "Scripture Focus",
    rows: [
      ROW(
        "Leader Talk (incl. reading)",
        "62% / 38%",
        "30% audience",
        "NEEDS WORK",
      ),
      ROW(
        "Leader Talk (discussion only)",
        "51% / 49%",
        "30% audience",
        "ON TARGET",
      ),
    ],
  },
  {
    table: "Time Management",
    rows: [
      ROW("Overall Class Time", "1h 30m", "1.5-2h", "ON TARGET"),
      ROW("Big Ideas review at open", "6 min (7%)", "5-10 min", "ON TARGET"),
    ],
  },
  {
    table: "Application Questions",
    rows: [ROW("Big Idea Questions", "9", "8-10", "STRONG")],
  },
  {
    table: "Engagement",
    rows: [ROW("Students asking questions", "40%", "50%", "NEEDS WORK")],
  },
  {
    table: "Leadership",
    rows: [
      ROW("Monologues >90 sec", "2", "≤2", "ON TARGET"),
      ROW("Monologue details", "at 25:00 and 41:00", "—", "N/A"),
    ],
  },
  {
    table: "Question Quality",
    rows: [ROW("Open-ended questions", "70%", "60%", "STRONG")],
  },
  {
    table: "Study Method & Communication",
    rows: [ROW("Periodic summaries", "3", "2+", "STRONG")],
  },
];

const point = (n: number, kind: string, minute: number) => ({
  title: `${kind} ${n}`,
  line: `One line about ${kind.toLowerCase()} ${n}.`,
  paragraphs: [`A paragraph about ${kind.toLowerCase()} ${n}.`],
  quote: `${kind.toLowerCase()} evidence ${n}`,
  timestamp: `00:${String(minute + n).padStart(2, "0")}:00`,
});

export function bodyAnswer(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    headline: "A room that started to open up",
    overview: ["The group read the first chapter and talked honestly."],
    summaryLine: "An honest session where a hard confession changed the room.",
    bigIdeas: [
      "God pursues the one who runs",
      "Honesty opens the room",
      "Read before you discuss",
      "Questions beat lectures",
      "Prayer is a shared practice",
    ],
    topic: "The call of the reluctant prophet",
    location: "Fellowship hall",
    mentorPresent: "Yes",
    booksStudied: "Jonah 1",
    scorecard: BODY_SCORECARD,
    strengths: [1, 2, 3, 4, 5].map((n) => point(n, "Strength", 30)),
    improvements: [1, 2, 3, 4, 5].map((n) => point(n, "Improvement", 40)),
    recommendations: [1, 2, 3, 4, 5].map((n) => ({
      title: `Recommendation ${n}`,
      line: `Try recommendation ${n} next week.`,
      paragraphs: [`Why recommendation ${n} matters.`],
    })),
    questions: [
      {
        question: "Why would the prophet run?",
        level: 3,
        note: "Opened the room.",
      },
      {
        question: "Where are you running today?",
        level: 4,
        note: "Went personal.",
      },
    ],
    monologues: [
      {
        timestamp: "00:25:00",
        length: "3 min",
        about: "Shipping routes of the time",
        fix: "Ask the group what they know first.",
      },
    ],
    keyMoments: [
      {
        type: "Capitalized",
        timestamp: "00:12:34",
        cluster: "Being Real",
        title: "A confession met with welcome",
        whatHappened: "A member admitted a long silence in prayer.",
        quote: "I haven't prayed in weeks",
        leaderDid: "Thanked her and opened it to the room.",
        whyItMattered: "It set the trust ceiling for the group.",
        impact: "Two more people shared.",
        biggerAlternative: "Name the courage it took before moving on.",
        clusterImpact: "Being Real was strengthened by the welcome.",
      },
      {
        type: "Missed",
        timestamp: "00:20:10",
        cluster: "Engaging People",
        title: "A question answered by a lecture",
        whatHappened: "A member asked why the prophet ran.",
        quote: "Why would the prophet run the other way?",
        leaderDid: "Moved on to the history without asking the room.",
        whyItMattered: "The member's own question was the doorway.",
        impact: "The room went quiet for the history.",
        biggerAlternative: "Ask: what would make you run the other way?",
        clusterImpact: "Engaging People lost a natural opening.",
      },
    ],
    ...overrides,
  });
}

export function bodySentences() {
  return BODY_TRANSCRIPT.map((line, index) => ({
    index,
    speakerId: line.speakerId,
    isLeader: line.isLeader,
    text: line.text,
    start_time: line.startTime ?? null,
    end_time: null,
  }));
}
