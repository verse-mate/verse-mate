import { t } from "elysia";

/** Query params for the public verse-of-the-day endpoint. */
export const VerseOfTheDayQueryDto = t.Object({
  // Client-supplied local date (YYYY-MM-DD) so local-midnight rollover is
  // honored. Validated server-side against the [today-1, today] window.
  date: t.Optional(t.String()),
  bible_version: t.Optional(t.String()),
  // Personalization id for unauthenticated callers — the home-screen widget
  // passes the user's own id here so it gets their personal verse (PD-7).
  // Validated as a UUID and only honored when there is no session; an
  // unknown/malformed value is ignored (falls back to the global verse).
  pid: t.Optional(t.String()),
});

/** Body for creating a curated verse (admin). */
export const CreateDailyVerseDto = t.Object({
  book_id: t.Integer({ minimum: 1, maximum: 66 }),
  chapter_number: t.Integer({ minimum: 1 }),
  verse_start: t.Integer({ minimum: 1 }),
  verse_end: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
  note: t.Optional(t.Union([t.String(), t.Null()])),
  is_active: t.Optional(t.Boolean()),
  tag_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
});

/** Body for updating a curated verse (admin) — all fields optional. */
export const UpdateDailyVerseDto = t.Object({
  book_id: t.Optional(t.Integer({ minimum: 1, maximum: 66 })),
  chapter_number: t.Optional(t.Integer({ minimum: 1 })),
  verse_start: t.Optional(t.Integer({ minimum: 1 })),
  verse_end: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
  note: t.Optional(t.Union([t.String(), t.Null()])),
  is_active: t.Optional(t.Boolean()),
  tag_ids: t.Optional(t.Array(t.String({ format: "uuid" }))),
});

/** Body for creating a new tag in the controlled vocabulary (admin). */
export const CreateDailyVerseTagDto = t.Object({
  slug: t.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", minLength: 1 }),
  label: t.String({ minLength: 1 }),
  is_active: t.Optional(t.Boolean()),
});
