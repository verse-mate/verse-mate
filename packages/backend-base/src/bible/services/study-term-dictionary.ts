/**
 * Deterministic normalization of the inductive-study "label-like" fields using
 * the DB-backed `study_term_translations` dictionary.
 *
 * The AI translate batch occasionally leaks short closed-vocabulary tokens back
 * in English — the `tag` pills (POSTURE/EYES/WILL/WHO/…), contrast `type`,
 * list `columns`, and the `title` book name. These are a tiny fixed set, so we
 * overwrite any value that comes back as a KNOWN ENGLISH source term with the
 * target-language term. Values that aren't English source terms (correct
 * translations, verse-refs like "3:1", numbers) are never in the dictionary, so
 * they're left untouched — the pass can't corrupt a good translation.
 *
 * Pure functions only (no DB import) so the logic is unit-testable; callers
 * fetch the rows and pass them in.
 */

export type StudyTermRow = {
  language_code: string;
  term_type: string;
  source_en: string;
  target_term: string;
};

/** `${term_type}:${source_en}` -> target_term */
export type StudyTermDict = Map<string, string>;

/**
 * Build the lookup for a language from raw rows, family-matched (`ro` ⇄
 * `ro-RO`): base-ISO rows are applied first, then exact-code rows override.
 */
export function buildStudyTermDictMap(
  rows: StudyTermRow[],
  languageCode: string,
): StudyTermDict {
  const map: StudyTermDict = new Map();
  const requested = (languageCode ?? "").trim().toLowerCase();
  if (!requested) return map;
  const base = requested.split("-")[0];
  // Lower priority: same base-ISO family.
  for (const r of rows) {
    if (r.language_code.toLowerCase().split("-")[0] === base) {
      map.set(`${r.term_type}:${r.source_en}`, r.target_term);
    }
  }
  // Higher priority: exact code overrides the family default.
  for (const r of rows) {
    if (r.language_code.toLowerCase() === requested) {
      map.set(`${r.term_type}:${r.source_en}`, r.target_term);
    }
  }
  return map;
}

/**
 * Walk a translated study and replace any label-like field whose value is a
 * known English source term with the dictionary's target term. Returns a NEW
 * object (does not mutate the input) plus the count of replacements made.
 */
export function applyStudyTermDictionary(
  content: unknown,
  dict: StudyTermDict,
): { content: unknown; replaced: number } {
  if (dict.size === 0) return { content, replaced: 0 };
  let replaced = 0;
  // Returns the target term ONLY when it differs from the current value, so an
  // identity mapping (e.g. ro "Contrast" -> "Contrast") is a no-op and isn't
  // counted as a replacement.
  const hit = (type: string, val: string): string | undefined => {
    const t = dict.get(`${type}:${val}`);
    return t !== undefined && t !== val ? t : undefined;
  };

  const walk = (node: unknown): unknown => {
    if (node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(node as Record<string, unknown>)) {
      const v = (node as Record<string, unknown>)[k];
      if (k === "tag" && typeof v === "string") {
        const t = hit("pill", v);
        if (t) {
          replaced++;
          out[k] = t;
        } else {
          out[k] = v;
        }
      } else if (k === "type" && typeof v === "string") {
        const t = hit("contrast_type", v);
        if (t) {
          replaced++;
          out[k] = t;
        } else {
          out[k] = v;
        }
      } else if (k === "title" && typeof v === "string") {
        // "James 2" -> "Iacov 2": swap only the leading book-name token.
        const m = v.match(/^(\S+)\s+(\d+)\s*$/);
        const t = m ? hit("book_name", m[1]) : undefined;
        if (t && m) {
          replaced++;
          out[k] = `${t} ${m[2]}`;
        } else {
          out[k] = walk(v);
        }
      } else if (k === "columns" && Array.isArray(v)) {
        out[k] = v.map((c) => {
          if (typeof c === "string") {
            const t = hit("list_column", c);
            if (t) {
              replaced++;
              return t;
            }
            return c;
          }
          return walk(c);
        });
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  };

  return { content: walk(content), replaced };
}
