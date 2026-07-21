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
