export const BIG_IDEAS_REVIEW_LABEL = "Big Ideas review at open";
export const BIG_IDEAS_REVIEW_TARGET = "5-10 min";
export const SCORECARD_RATINGS = [
  "STRONG",
  "ON TARGET",
  "NEEDS WORK",
  "N/A",
] as const;
export type ScorecardRating = (typeof SCORECARD_RATINGS)[number];

export interface BigIdeasReviewRow {
  value: string;
  rating: ScorecardRating;
}

const REVIEW_ROW = /^big ideas review( at open)?\s*:/i;
const TIME_TABLE = /^Scorecard — Table 3$/;

export function validBigIdeasReviewRow(
  row: { value?: unknown; rating?: unknown } | null | undefined,
): BigIdeasReviewRow | null {
  const value = typeof row?.value === "string" ? row.value.trim() : "";
  const rating = SCORECARD_RATINGS.find((r) => r === row?.rating);
  return value && rating ? { value, rating } : null;
}

type Section = { title?: unknown; bullets?: unknown };

function sectionsOf(body: unknown): Section[] {
  const sections = (body as { sections?: unknown } | null)?.sections;
  return Array.isArray(sections) ? (sections as Section[]) : [];
}

export function withoutBigIdeasReviewRow<T>(body: T): T {
  const sections = sectionsOf(body);
  if (sections.length === 0) return body;
  return {
    ...(body as object),
    sections: sections.map((section) =>
      Array.isArray(section.bullets)
        ? {
            ...section,
            bullets: section.bullets.filter(
              (b) => !(typeof b === "string" && REVIEW_ROW.test(b)),
            ),
          }
        : section,
    ),
  } as T;
}

export function withBigIdeasReviewRow<T>(body: T, row: BigIdeasReviewRow): T {
  const bullet = `${BIG_IDEAS_REVIEW_LABEL}: ${row.value}  (Target: ${BIG_IDEAS_REVIEW_TARGET})  → ${row.rating}`;
  const sections = sectionsOf(withoutBigIdeasReviewRow(body));
  const at = sections.findIndex(
    (s) => typeof s.title === "string" && TIME_TABLE.test(s.title),
  );
  const next =
    at < 0
      ? [...sections, { title: "Scorecard — Table 3", bullets: [bullet] }]
      : sections.map((section, i) => {
          if (i !== at) return section;
          const bullets = Array.isArray(section.bullets)
            ? [...section.bullets]
            : [];
          bullets.splice(Math.min(1, bullets.length), 0, bullet);
          return { ...section, bullets };
        });
  return { ...((body ?? {}) as object), sections: next } as T;
}
