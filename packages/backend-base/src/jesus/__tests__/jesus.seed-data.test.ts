import { describe, expect, it } from "bun:test";

import {
  JESUS_COLLECTIONS,
  JESUS_ENTRIES,
  JESUS_PERIODS,
  JESUS_THEMES,
  LIFE_TIMELINE,
} from "database/src/seeds/data/jesus.data";

import { JESUS_KINDS, JESUS_SECTION_META } from "../jesus.constants";
import { generateEntrySlug, parseReference } from "../utils/reference.utils";

/**
 * Integrity checks on the seed corpus.
 *
 * The seeder validates the same invariants and throws, but by then you are
 * mid-migration on a real database. Asserting them here means a bad slug or an
 * unparseable reference fails CI on the pull request that introduced it.
 */

const entrySlugs = new Set(JESUS_ENTRIES.map((e) => e.slug));
const themeSlugs = new Set(JESUS_THEMES.map((t) => t.slug));
const periodSlugs = new Set(JESUS_PERIODS.map((p) => p.slug));

describe("Jesus seed corpus — entries", () => {
  it("has a substantial corpus", () => {
    expect(JESUS_ENTRIES.length).toBeGreaterThan(150);
  });

  it("has no duplicate slugs", () => {
    expect(entrySlugs.size).toBe(JESUS_ENTRIES.length);
  });

  it("uses only slugs that survive the slug algorithm unchanged", () => {
    // A slug that would be rewritten means the URL in the wild and the URL the
    // app generates disagree.
    for (const entry of JESUS_ENTRIES) {
      expect(generateEntrySlug(entry.slug)).toBe(entry.slug);
    }
  });

  it("uses only known kinds", () => {
    for (const entry of JESUS_ENTRIES) {
      expect(JESUS_KINDS).toContain(entry.kind);
    }
  });

  it("gives every entry a title and a summary", () => {
    for (const entry of JESUS_ENTRIES) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every entry at least one parseable scripture reference", () => {
    for (const entry of JESUS_ENTRIES) {
      expect(entry.refs.length).toBeGreaterThan(0);
      for (const ref of entry.refs) {
        expect(parseReference(ref)).not.toBeNull();
      }
    }
  });

  it("never repeats a reference within one entry", () => {
    for (const entry of JESUS_ENTRIES) {
      expect(new Set(entry.refs).size).toBe(entry.refs.length);
    }
  });

  it("tags every entry with at least one known theme", () => {
    for (const entry of JESUS_ENTRIES) {
      expect(entry.themes.length).toBeGreaterThan(0);
      for (const theme of entry.themes) {
        expect(themeSlugs.has(theme)).toBe(true);
      }
    }
  });

  it("pairs a quote with a quote reference", () => {
    for (const entry of JESUS_ENTRIES) {
      if (entry.quote) {
        expect(entry.quoteRef).toBeTruthy();
        expect(parseReference(entry.quoteRef as string)).not.toBeNull();
      }
    }
  });

  it("covers every kind with at least one entry", () => {
    for (const kind of JESUS_KINDS) {
      const count = JESUS_ENTRIES.filter((e) => e.kind === kind).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it("reaches every entry from one of the hub's sections", () => {
    // A kind the corpus writes but no section lists is not a loud failure —
    // the entries are seeded, and then simply never appear. `HEALING` was in
    // this state: 22 healings in the database, none of them on the hub, none
    // of them in "every miracle of Jesus". Belonging to a kind is not enough;
    // the kind has to be somewhere a reader can get to.
    const reachable = new Set(
      Object.values(JESUS_SECTION_META).flatMap((section) => section.kinds),
    );
    for (const entry of JESUS_ENTRIES) {
      expect({
        slug: entry.slug,
        reachable: reachable.has(entry.kind),
      }).toEqual({ slug: entry.slug, reachable: true });
    }
  });

  it("documents the traditional catalogue of miracles", () => {
    // The commonly published harmonies list 33-40 distinct miracles; the
    // spread is a counting question ("he healed many" — one or many?), not a
    // doctrinal one. 37 is the usual traditional catalogue, and the corpus is
    // not allowed to fall under it.
    const miracles = JESUS_ENTRIES.filter(
      (e) => e.kind === "MIRACLE" || e.kind === "HEALING",
    );
    expect(miracles.length).toBeGreaterThanOrEqual(37);
  });
});

describe("Jesus seed corpus — taxonomy", () => {
  it("has unique theme slugs", () => {
    expect(themeSlugs.size).toBe(JESUS_THEMES.length);
  });

  it("has unique period slugs", () => {
    expect(periodSlugs.size).toBe(JESUS_PERIODS.length);
  });

  it("leaves no theme without entries", () => {
    for (const theme of JESUS_THEMES) {
      const count = JESUS_ENTRIES.filter((e) =>
        e.themes.includes(theme.slug),
      ).length;
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe("Jesus seed corpus — the life timeline", () => {
  it("only references known periods", () => {
    for (const periodSlug of Object.keys(LIFE_TIMELINE)) {
      expect(periodSlugs.has(periodSlug)).toBe(true);
    }
  });

  it("only references known entries", () => {
    for (const [periodSlug, slugs] of Object.entries(LIFE_TIMELINE)) {
      for (const slug of slugs) {
        // Named in the assertion so a failure says which slug is wrong.
        expect({ periodSlug, slug, known: entrySlugs.has(slug) }).toEqual({
          periodSlug,
          slug,
          known: true,
        });
      }
    }
  });

  it("never places the same entry in two periods", () => {
    const placements = new Map<string, string>();
    for (const [periodSlug, slugs] of Object.entries(LIFE_TIMELINE)) {
      for (const slug of slugs) {
        expect(placements.has(slug)).toBe(false);
        placements.set(slug, periodSlug);
      }
    }
  });

  it("never repeats an entry within one period", () => {
    for (const slugs of Object.values(LIFE_TIMELINE)) {
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("places a majority of the corpus on the timeline", () => {
    const placed = Object.values(LIFE_TIMELINE).flat().length;
    expect(placed / JESUS_ENTRIES.length).toBeGreaterThan(0.6);
  });
});

describe("Jesus seed corpus — collections", () => {
  it("has unique collection slugs", () => {
    const slugs = JESUS_COLLECTIONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every collection exactly one membership strategy", () => {
    for (const collection of JESUS_COLLECTIONS) {
      const hasFilter = !!collection.filter;
      const hasMembers = !!collection.members?.length;
      expect(hasFilter !== hasMembers).toBe(true);
    }
  });

  it("only references known entries in curated collections", () => {
    for (const collection of JESUS_COLLECTIONS) {
      for (const slug of collection.members ?? []) {
        expect({
          collection: collection.slug,
          slug,
          known: entrySlugs.has(slug),
        }).toEqual({
          collection: collection.slug,
          slug,
          known: true,
        });
      }
    }
  });

  it("never repeats a member within a collection", () => {
    for (const collection of JESUS_COLLECTIONS) {
      const members = collection.members ?? [];
      expect(new Set(members).size).toBe(members.length);
    }
  });

  it("only filters on known kinds and themes", () => {
    for (const collection of JESUS_COLLECTIONS) {
      const filter = collection.filter;
      if (!filter) continue;
      if (filter.kind) expect(JESUS_KINDS).toContain(filter.kind);
      for (const kind of filter.kinds ?? [])
        expect(JESUS_KINDS).toContain(kind);
      if (filter.theme) expect(themeSlugs.has(filter.theme)).toBe(true);
    }
  });

  it('means every miracle by "every miracle"', () => {
    // The corpus types a sign over nature and a sign over a body differently,
    // so a study that filters on MIRACLE alone answers "every miracle" with a
    // third of them.
    const miracles = JESUS_COLLECTIONS.find(
      (c) => c.slug === "every-miracle-of-jesus",
    );
    expect(miracles?.filter?.kinds).toEqual(["MIRACLE", "HEALING"]);
  });

  it("features the studies the hub is designed to show", () => {
    const featured = JESUS_COLLECTIONS.filter((c) => c.isFeatured).map(
      (c) => c.slug,
    );
    expect(featured).toContain("the-i-am-statements");
    expect(featured).toContain("every-question-jesus-asked");
    expect(featured).toContain("every-miracle-of-jesus");
    expect(featured).toContain("what-the-miracles-reveal");
    expect(featured).toContain("jesus-and-the-pharisees");
    expect(featured).toContain("jesus-and-outsiders");
    expect(featured).toContain("what-he-said-about-god");
  });
});
