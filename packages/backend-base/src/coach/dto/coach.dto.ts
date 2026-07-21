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

/** Body for POST /coach/admin/leaders. `email` is required; name/group/coach
 *  are optional (name is derived from the email when omitted). */
export const AddLeaderDto = t.Object({
  email: t.String({ minLength: 3, maxLength: 320 }),
  name: t.Optional(t.String({ maxLength: 200 })),
  group: t.Optional(t.String({ maxLength: 200 })),
  coachName: t.Optional(t.String({ maxLength: 200 })),
});

export type AddLeaderDto = typeof AddLeaderDto.static;

/** Body for PUT /coach/admin/coaches/:id/reports/:reportId/recording. Empty
 *  string clears the link; a non-empty value must be an http(s) URL. */
export const UpdateRecordingLinkDto = t.Object({
  recordingUrl: t.String({ maxLength: 2048 }),
});

export type UpdateRecordingLinkDto = typeof UpdateRecordingLinkDto.static;

/** Body for POST /coach/admin/coaches/:id/reports/:reportId/notes. */
export const AddNoteDto = t.Object({
  body: t.String({ minLength: 1, maxLength: 8000 }),
});

export type AddNoteDto = typeof AddNoteDto.static;
