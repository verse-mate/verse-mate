import { describe, expect, it } from "bun:test";
import {
  type StudyTermRow,
  applyStudyTermDictionary,
  buildStudyTermDictMap,
} from "./study-term-dictionary";

const ROWS: StudyTermRow[] = [
  {
    language_code: "uk",
    term_type: "pill",
    source_en: "EYES",
    target_term: "ОЧІ",
  },
  {
    language_code: "uk",
    term_type: "pill",
    source_en: "WILL",
    target_term: "ВОЛЯ",
  },
  {
    language_code: "uk",
    term_type: "book_name",
    source_en: "James",
    target_term: "Якова",
  },
  {
    language_code: "uk",
    term_type: "contrast_type",
    source_en: "Comparison",
    target_term: "Порівняння",
  },
  {
    language_code: "uk",
    term_type: "list_column",
    source_en: "Truth",
    target_term: "Істина",
  },
  // a different language, to prove isolation + family matching
  {
    language_code: "es-MX",
    term_type: "pill",
    source_en: "EYES",
    target_term: "OJOS",
  },
];

describe("buildStudyTermDictMap", () => {
  it("keys by term_type:source_en and family-matches base ISO", () => {
    const exact = buildStudyTermDictMap(ROWS, "uk");
    expect(exact.get("pill:EYES")).toBe("ОЧІ");
    expect(exact.get("book_name:James")).toBe("Якова");
    // es-MX request resolves via base 'es'
    const es = buildStudyTermDictMap(ROWS, "es");
    expect(es.get("pill:EYES")).toBe("OJOS");
    expect(es.has("pill:WILL")).toBe(false);
  });

  it("returns empty for blank language", () => {
    expect(buildStudyTermDictMap(ROWS, "").size).toBe(0);
  });
});

describe("applyStudyTermDictionary", () => {
  const dict = buildStudyTermDictMap(ROWS, "uk");

  it("replaces English leaks but never touches correct translations or verse-refs", () => {
    const content = {
      title: "James 2",
      themeOneLine: "Жива віра…", // already translated — left alone
      steps: [
        {
          kind: "keywords",
          items: [
            { tag: "EYES", note: "x" }, // English pill -> replaced
            { tag: "ВОЛЯ", note: "y" }, // already Ukrainian -> kept
            { tag: "3:1", note: "ref" }, // verse-ref -> kept
          ],
        },
        {
          kind: "contrasts",
          items: [{ type: "Comparison", columns: ["Truth", "Вірш"] }],
        },
      ],
    };
    const res = applyStudyTermDictionary(content, dict);
    type LooseStudy = {
      title: string;
      steps: { items: Record<string, unknown>[] }[];
    };
    const out = res.content as LooseStudy;
    expect(out.title).toBe("Якова 2"); // book name swapped, number kept
    expect(out.steps[0].items[0].tag).toBe("ОЧІ"); // EYES -> ОЧІ
    expect(out.steps[0].items[1].tag).toBe("ВОЛЯ"); // untouched
    expect(out.steps[0].items[2].tag).toBe("3:1"); // verse-ref untouched
    expect(out.steps[1].items[0].type).toBe("Порівняння"); // Comparison
    expect(out.steps[1].items[0].columns).toEqual(["Істина", "Вірш"]); // Truth->Істина, kept
    expect(res.replaced).toBe(4);
  });

  it("does not mutate the input object", () => {
    const content = { steps: [{ items: [{ tag: "EYES" }] }] };
    const copy = JSON.parse(JSON.stringify(content));
    applyStudyTermDictionary(content, dict);
    expect(content).toEqual(copy);
  });

  it("is a no-op with an empty dictionary", () => {
    const content = { title: "James 2", steps: [] };
    const { content: out, replaced } = applyStudyTermDictionary(
      content,
      new Map(),
    );
    expect(replaced).toBe(0);
    expect(out).toBe(content);
  });
});
