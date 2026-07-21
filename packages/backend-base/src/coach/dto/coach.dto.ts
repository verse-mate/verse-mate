import { t } from "elysia";

/** Body for PUT /coach/zoom-link. Empty string clears the link; a non-empty
 *  value must be an http(s) URL (Zoom / Meet / Teams are all just URLs). */
export const UpdateZoomLinkDto = t.Object({
  zoomLink: t.String({ maxLength: 2048 }),
});

export type UpdateZoomLinkDto = typeof UpdateZoomLinkDto.static;

/** Body for PUT /coach/affiliated-church. Empty string clears the value; any
 *  non-empty value is a free-form church name. */
export const UpdateAffiliatedChurchDto = t.Object({
  affiliatedChurch: t.String({ maxLength: 200 }),
});

export type UpdateAffiliatedChurchDto = typeof UpdateAffiliatedChurchDto.static;

/** Allowed recurrence keywords for a class. */
export const CLASS_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
] as const;

/** Body for POST / PUT /coach/classes. `classDate` is an ISO yyyy-mm-dd string
 *  or empty (no pinned date); `zoomLink` is empty or a well-formed http(s) URL
 *  (validated in the plugin so the message matches the zoom-link route). */
export const CoachClassDto = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  classDate: t.String({ maxLength: 10 }),
  recurrence: t.Union(CLASS_RECURRENCES.map((r) => t.Literal(r))),
  zoomLink: t.String({ maxLength: 2048 }),
});

export type CoachClassDto = typeof CoachClassDto.static;
