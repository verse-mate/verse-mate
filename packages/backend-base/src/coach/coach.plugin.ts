import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { createErrorHandler } from "../common/error-handler";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import {
  AdminCoachClassSchema,
  CoachClassSchema,
  MonthlySchema,
  NoteSchema,
  ReportSchema,
} from "./coach.schema";
import { CoachService } from "./coach.service";
import {
  AddLeaderDto,
  AddNoteDto,
  CoachClassDto,
  UpdateAffiliatedChurchDto,
  UpdateBibleCoachDto,
  UpdateRecordingLinkDto,
  UpdateZoomLinkDto,
} from "./dto/coach.dto";

/** Empty (clear) or a well-formed http(s) URL — shared by zoom + recording. */
const isBlankOrHttpUrl = (v: string): boolean =>
  v === "" || /^https?:\/\/\S+$/i.test(v);

/** Minimal email shape check for the add-leader form. */
const isEmail = (v: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// ─── Response schemas ──────────────────────────────────────────────────────
// ReportSchema (and its parts) live in coach.schema.ts — a side-effect-free
// module so the response contract can be unit-tested without booting the
// plugin. Elysia strips any response field not declared in that schema, which
// is why the coaching prose must be present there to reach the portal.

const MeSchema = t.Object({
  isCoach: t.Boolean(),
  isAdmin: t.Boolean(),
  profile: t.Union([
    t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String(),
      group: t.String(),
      coachName: t.String(),
    }),
    t.Null(),
  ]),
  zoomLink: t.String(),
  affiliatedChurch: t.String(),
  bibleCoach: t.String(),
  model: t.String(),
  clusters: t.Array(t.Object({ name: t.String(), weight: t.Number() })),
  statusBands: t.Array(
    t.Object({ min: t.Number(), label: t.String(), emoji: t.String() }),
  ),
});

// Shared validation + normalization for a class body. Mirrors the zoom-link
// route's URL rule and enforces an ISO yyyy-mm-dd (or empty) date. Returns the
// CoachClassInput the service/repository expect (empty date → null).
function normalizeClassBody(body: {
  name: string;
  classDate: string;
  recurrence: string;
  zoomLink: string;
}): {
  name: string;
  classDate: string | null;
  recurrence: string;
  zoomLink: string;
} {
  const name = body.name.trim();
  if (!name) throw new ValidationError("Class name is required");

  const zoomLink = body.zoomLink.trim();
  if (zoomLink && !/^https?:\/\/\S+$/i.test(zoomLink)) {
    throw new ValidationError("Enter a valid http(s) link");
  }

  const classDate = body.classDate.trim();
  if (classDate && !/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
    throw new ValidationError("Date must be in YYYY-MM-DD format");
  }

  return {
    name,
    classDate: classDate || null,
    recurrence: body.recurrence,
    zoomLink,
  };
}

const ProfileHeaderSchema = t.Object({
  id: t.String(),
  name: t.String(),
  group: t.String(),
  coachName: t.String(),
});

const CoachSummarySchema = t.Object({
  id: t.String(),
  name: t.String(),
  group: t.String(),
  coachName: t.String(),
  sessionCount: t.Number(),
  latest: t.Union([
    t.Object({
      date: t.String(),
      dateLabel: t.String(),
      score: t.Number(),
      status: t.String(),
      statusEmoji: t.String(),
    }),
    t.Null(),
  ]),
});

const TrendRowSchema = t.Record(
  t.String(),
  t.Union([t.Number(), t.String(), t.Null()]),
);

const TrendsSchema = t.Object({
  scoreSeries: t.Array(
    t.Object({
      date: t.String(),
      dateLabel: t.String(),
      session: t.String(),
      score: t.Number(),
      status: t.String(),
    }),
  ),
  clusterSeries: t.Array(TrendRowSchema),
  dimensionSeries: t.Array(TrendRowSchema),
  delta: t.Union([
    t.Object({
      score: t.Number(),
      from: t.Number(),
      to: t.Number(),
      fromLabel: t.String(),
      toLabel: t.String(),
    }),
    t.Null(),
  ]),
});

// ─── Plugin ────────────────────────────────────────────────────────────────
//
// Auth: every route derives `currentUserId` from the bearer token. A missing
// / invalid token → 401 (UnauthorizedError). A valid token whose account is
// not in the coaching roster → 403 (ForbiddenError) — the web client renders
// its "not a coaching account" gate on 403 and its "sign in" gate on 401.

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("coach plugin"))
  .state((state) => ({
    ...state,
    coachService: new CoachService(state.db, state.notification),
  }))
  .group("/coach", (app) =>
    app
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/me",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const me = await coachService.getMe(currentUserId);
          if (!me) throw new ForbiddenError("Not a coaching account");
          return me;
        },
        { response: { 200: MeSchema, ...StandardErrorResponses } },
      )
      .get(
        "/reports",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const reports = await coachService.getReports(currentUserId);
          if (!reports) throw new ForbiddenError("Not a coaching account");
          return { reports };
        },
        {
          response: {
            200: t.Object({ reports: t.Array(ReportSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/trends",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const trends = await coachService.getTrends(currentUserId);
          if (!trends) throw new ForbiddenError("Not a coaching account");
          return trends;
        },
        { response: { 200: TrendsSchema, ...StandardErrorResponses } },
      )
      .put(
        "/zoom-link",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const zoomLink = body.zoomLink.trim();
          // Accept empty (clear) or a well-formed http(s) URL.
          if (zoomLink && !/^https?:\/\/\S+$/i.test(zoomLink)) {
            throw new ForbiddenError("Enter a valid http(s) link");
          }
          const saved = await coachService.setZoomLink(currentUserId, zoomLink);
          if (saved === null)
            throw new ForbiddenError("Not a coaching account");
          return { zoomLink: saved };
        },
        {
          body: UpdateZoomLinkDto,
          response: {
            200: t.Object({ zoomLink: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/affiliated-church",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const affiliatedChurch = body.affiliatedChurch.trim();
          const saved = await coachService.setAffiliatedChurch(
            currentUserId,
            affiliatedChurch,
          );
          if (saved === null)
            throw new ForbiddenError("Not a coaching account");
          return { affiliatedChurch: saved };
        },
        {
          body: UpdateAffiliatedChurchDto,
          response: {
            200: t.Object({ affiliatedChurch: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/bible-coach",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const bibleCoach = body.bibleCoach.trim();
          const saved = await coachService.setBibleCoach(
            currentUserId,
            bibleCoach,
          );
          if (saved === null)
            throw new ForbiddenError("Not a coaching account");
          return { bibleCoach: saved };
        },
        {
          body: UpdateBibleCoachDto,
          response: {
            200: t.Object({ bibleCoach: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      // ─── Classes (many per leader) ──────────────────────────────────────
      // The leader registers each study they run. Each class's zoom_link is a
      // meeting the Notetaker bot joins; the program admin reads the whole set
      // via GET /coach/admin/classes.
      .get(
        "/classes",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const classes = await coachService.getClasses(currentUserId);
          if (classes === null)
            throw new ForbiddenError("Not a coaching account");
          return { classes };
        },
        {
          response: {
            200: t.Object({ classes: t.Array(CoachClassSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/classes",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const input = normalizeClassBody(body);
          const created = await coachService.addClass(currentUserId, input);
          if (created === null)
            throw new ForbiddenError("Not a coaching account");
          return { class: created };
        },
        {
          body: CoachClassDto,
          response: {
            200: t.Object({ class: CoachClassSchema }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/classes/:id",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const input = normalizeClassBody(body);
          const updated = await coachService.updateClass(
            currentUserId,
            params.id,
            input,
          );
          if (updated === null) {
            // Either not a coach or the class id isn't theirs. Distinguish so
            // the client shows the right message.
            if (!(await coachService.isCoach(currentUserId)))
              throw new ForbiddenError("Not a coaching account");
            throw new NotFoundError("Class not found");
          }
          return { class: updated };
        },
        {
          params: t.Object({ id: t.String() }),
          body: CoachClassDto,
          response: {
            200: t.Object({ class: CoachClassSchema }),
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/classes/:id",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const result = await coachService.removeClass(
            currentUserId,
            params.id,
          );
          if (result === "not_coach")
            throw new ForbiddenError("Not a coaching account");
          if (result === "not_found")
            throw new NotFoundError("Class not found");
          return { success: true };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ success: t.Boolean() }),
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      // ─── Admin oversight (program admins only) ──────────────────────────
      // Every /coach/admin/* route requires isAdmin(); non-admin coaches get
      // 403 so the web client keeps them in their own dashboard.
      .get(
        "/admin/coaches",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return { coaches: await coachService.listCoaches() };
        },
        {
          response: {
            200: t.Object({ coaches: t.Array(CoachSummarySchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/coaches/:id/reports",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const profile = await coachService.getProfileById(params.id);
          const reports = await coachService.getReportsById(params.id);
          if (!profile || !reports) throw new NotFoundError("Coach not found");
          return { profile, reports };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({
              profile: ProfileHeaderSchema,
              reports: t.Array(ReportSchema),
            }),
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/coaches/:id/trends",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const trends = await coachService.getTrendsById(params.id);
          if (!trends) throw new NotFoundError("Coach not found");
          return trends;
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: TrendsSchema,
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      // Every leader's classes + owner identity — the single feed the Fireflies
      // operator reads to configure which meeting links the bot auto-joins.
      .get(
        "/admin/classes",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return { classes: await coachService.listAllClasses() };
        },
        {
          response: {
            200: t.Object({ classes: t.Array(AdminCoachClassSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      // Add a leader by email (+ optional name/group). Sends an invite email.
      .post(
        "/admin/leaders",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const email = body.email.trim().toLowerCase();
          if (!isEmail(email))
            throw new ValidationError("Enter a valid email address");
          const result = await coachService.addLeader(currentUserId, {
            email,
            name: body.name,
            group: body.group,
            coachName: body.coachName,
          });
          if (!result.ok)
            throw new ConflictError("That email is already a leader");
          return { coach: result.coach };
        },
        {
          body: AddLeaderDto,
          response: {
            200: t.Object({ coach: CoachSummarySchema }),
            ...StandardErrorResponses,
          },
        },
      )
      // Set / clear a session's recording URL.
      .put(
        "/admin/coaches/:id/reports/:reportId/recording",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const recordingUrl = body.recordingUrl.trim();
          if (!isBlankOrHttpUrl(recordingUrl))
            throw new ValidationError("Enter a valid http(s) link");
          const saved = await coachService.setRecordingLink(
            params.id,
            params.reportId,
            recordingUrl,
          );
          if (saved === null) throw new NotFoundError("Session not found");
          return { recordingUrl: saved };
        },
        {
          params: t.Object({ id: t.String(), reportId: t.String() }),
          body: UpdateRecordingLinkDto,
          response: {
            200: t.Object({ recordingUrl: t.String() }),
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      // Write a coaching note on a session — persisted + emailed to the leader.
      .post(
        "/admin/coaches/:id/reports/:reportId/notes",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const text = body.body.trim();
          if (!text) throw new ValidationError("Note cannot be empty");
          const note = await coachService.addNote(
            params.id,
            params.reportId,
            currentUserId,
            text,
          );
          if (note === null) throw new NotFoundError("Session not found");
          return { note };
        },
        {
          params: t.Object({ id: t.String(), reportId: t.String() }),
          body: AddNoteDto,
          response: {
            200: t.Object({ note: NoteSchema }),
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      // Program-wide + per-leader monthly analysis for a YYYY-MM month.
      .get(
        "/admin/monthly",
        async ({ query, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const month = (query.month ?? "").trim();
          if (!/^\d{4}-\d{2}$/.test(month))
            throw new ValidationError("month must be YYYY-MM");
          return coachService.getMonthly(month);
        },
        {
          query: t.Object({ month: t.String() }),
          response: {
            200: MonthlySchema,
            ...StandardErrorResponses,
          },
        },
      ),
  );

export type CoachPlugin = typeof plugin;

export default plugin;
