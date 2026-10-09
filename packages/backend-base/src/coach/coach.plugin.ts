import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { clientIp } from "../common/client-ip";
import { isEmailAddress } from "../common/email-address";
import { createErrorHandler } from "../common/error-handler";
import {
  type ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import { createRateLimit } from "../common/rate-limit.middleware";
import { StandardErrorResponses } from "../common/response-schemas";
import { getAiProvider } from "../shared/ai";
import shared from "../shared/shared.plugin";
import { CoachIdentityService } from "./coach-identity.service";
import { CoachMonthlyService } from "./coach-monthly.service";
import { MINTED_URL_LIFETIME_SECONDS } from "./coach-retained-media.service";
import { HOLD_KINDS } from "./coach-session-state";
import {
  AddressChangeDescriptionSchema,
  AdminCoachClassSchema,
  AmendmentBodySchema,
  BigIdeasReviewRowSchema,
  COACH_REFUSALS,
  CoachClassSchema,
  type CoachRefusal,
  type CoachRefusalRoute,
  CoverageReportSchema,
  EMAIL_RULE,
  IdentityAuditSchema,
  ImprovementsEditBodySchema,
  LeaderMonthlyResponseSchema,
  LikelyDuplicateSchema,
  MonthlyReportEditSchema,
  MonthlyReportRowSchema,
  MonthlySchema,
  NoteSchema,
  ParallelRunComparisonSchema,
  ReportSchema,
  ReviewStateSchema,
  RevisionResultSchema,
  RevisionSendSchema,
  RevisionsSchema,
  RotatingClassBodySchema,
  RotatingClassSchema,
  RubricContractSchema,
  UploadClassSchema,
  UploadPartsSchema,
  UploadRequestBodySchema,
  UploadViewSchema,
} from "./coach.schema";
import {
  CoachService,
  PIPELINE_FAILURES_MAX,
  PIPELINE_FAILURES_PAGE,
} from "./coach.service";
import {
  AddLeaderDto,
  AddNoteDto,
  CoachClassDto,
  UpdateAffiliatedChurchDto,
  UpdateBibleCoachDto,
  UpdateRecordingLinkDto,
  UpdateZoomLinkDto,
} from "./dto/coach.dto";
import { rubricContract } from "./rubric";

const caller = (context: {
  currentUserId?: string | null;
  request: Request;
  server?: { requestIP(request: Request): { address: string } | null } | null;
}) =>
  context.currentUserId ?? `ip:${clientIp(context.request, context.server)}`;

const coachRateLimit = createRateLimit({
  windowSeconds: 60,
  max: 120,
  keyGenerator: (context) => `coach:${caller(context)}`,
  message: "Too many coaching requests, please try again in a minute",
});

const mintRateLimit = createRateLimit({
  windowSeconds: 60,
  max: 20,
  keyGenerator: (context) => `coach-mint:${caller(context)}`,
  message: "Too many recording requests, please try again in a minute",
});

/** Empty (clear) or a well-formed http(s) URL, shared by zoom + recording. */
const isBlankOrHttpUrl = (v: string): boolean =>
  v === "" || /^https?:\/\/\S+$/i.test(v);

export { EMAIL_RULE };

const REFUSAL_ERRORS = {
  400: ValidationError,
  404: NotFoundError,
  409: ConflictError,
} as const;

function refuse<R extends CoachRefusalRoute>(
  route: R,
  code: string,
  extra: { message?: string; details?: Record<string, unknown> } = {},
): ApiError {
  const listed = (COACH_REFUSALS[route] as Record<string, CoachRefusal>)[code];
  const details = { refusal: code, ...extra.details };
  if (!listed) return new ValidationError(`Refused: ${code}`, details);
  return new REFUSAL_ERRORS[listed.status](
    extra.message ?? listed.message,
    details,
  );
}

function revisionResponse<
  T extends {
    applied: boolean;
    refusal?: string;
    violations?: Array<{ rule: string; detail: string }>;
    status?: { label: string };
  },
>(route: CoachRefusalRoute, result: T) {
  if (result.refusal && result.refusal in COACH_REFUSALS[route])
    throw refuse(route, result.refusal);
  return {
    ...result,
    violations: result.violations?.map((v) => `${v.rule}: ${v.detail}`),
    status: result.status?.label,
  };
}

// ─── Response schemas ──────────────────────────────────────────────────────
// ReportSchema (and its parts) live in coach.schema.ts, a side-effect-free
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

const SummaryPageSchema = t.Object({
  items: t.Array(t.Record(t.String(), t.Unknown())),
  total: t.Number(),
  streakWeeks: t.Number(),
  quarterSessions: t.Number(),
});

const PageQuery = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
  offset: t.Optional(t.Numeric({ minimum: 0 })),
});

const CoachSummarySchema = t.Object({
  id: t.String(),
  name: t.String(),
  group: t.String(),
  coachName: t.String(),
  sessionCount: t.Number(),
  addressChange: t.Optional(
    t.Union([
      t.Object({
        newEmail: t.String(),
        state: t.Union([
          t.Literal("pending"),
          t.Literal("expired"),
          t.Literal("refused"),
        ]),
        reason: t.Union([t.String(), t.Null()]),
        requestedAt: t.String(),
        expiresAt: t.String(),
      }),
      t.Null(),
    ]),
  ),
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
      reportId: t.String(),
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
// not in the coaching roster → 403 (ForbiddenError), the web client renders
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
      // ── The rubric contract ───────────────────────────────────────────
      // The ONE definition of clusters, weights, the dimension mapping, each
      // dimension's explainer and target, and both band scales. Declared
      // BEFORE the session-derived routes because it carries no leader data:
      // it is the scoring model itself, and the portal needs it to render an
      // explainer for a score it is already showing. Serving it is what lets
      // verse-mate-web delete its hand-maintained copies (task 8.2).
      .get("/rubric", () => rubricContract(), {
        response: {
          200: RubricContractSchema,
          ...StandardErrorResponses,
        },
      })
      .resolve({ as: "scoped" }, authDerive)
      .onBeforeHandle(coachRateLimit)
      .post(
        "/confirm-address/describe",
        async ({ body, store: { coachService } }) => {
          const change = await coachService.describeLeaderEmailChange(
            body.token,
          );
          if (!change)
            throw refuse(
              "POST /coach/confirm-address/describe",
              "invalid-link",
            );
          return change;
        },
        {
          body: t.Object({ token: t.String({ maxLength: 200 }) }),
          response: {
            200: AddressChangeDescriptionSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/confirm-address",
        async ({ body, store: { coachService } }) => {
          const result = await coachService.confirmLeaderEmailChange(
            body.token,
          );
          if (result.ok)
            return { email: result.email, noticeSent: result.noticeSent };
          throw refuse("POST /coach/confirm-address", result.refusal);
        },
        {
          body: t.Object({ token: t.String({ maxLength: 200 }) }),
          response: {
            200: t.Object({ email: t.String(), noticeSent: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
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
      // ── Paginated session list (new shape) ────────────────────────────
      // Added ALONGSIDE /reports so the portal can migrate without a
      // breaking change; /reports is retired once web is on this route.
      .get(
        "/reports/summary",
        async ({ store: { coachService }, currentUserId, query }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const me = await coachService.getMe(currentUserId);
          if (!me?.profile) throw new ForbiddenError("Not a coaching account");
          return coachService.getReportSummaries(me.profile.id, {
            limit: query.limit,
            offset: query.offset,
          });
        },
        {
          // Validated at the boundary: a non-numeric page input is a CLIENT
          // error. Parsed as strings and coerced with Number() it reached SQL
          // as NaN and returned a 500 quoting Postgres.
          query: t.Object({
            limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
            offset: t.Optional(t.Numeric({ minimum: 0 })),
          }),
          response: {
            200: SummaryPageSchema,
            ...StandardErrorResponses,
          },
        },
      )
      // ── One session's full content ────────────────────────────────────
      // Resolves an immutable OR legacy id; an unknown id is an explicit
      // 404 rather than silently rendering a different session.
      .get(
        "/reports/:reportId",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const me = await coachService.getMe(currentUserId);
          if (!me?.profile) throw new ForbiddenError("Not a coaching account");
          // SECURITY: scope to the caller's own coaching record.
          const report = await coachService.getReportDetail(
            me.profile.id,
            params.reportId,
          );
          if (!report) throw new NotFoundError("Session not found");
          return { report };
        },
        {
          response: {
            200: t.Object({ report: ReportSchema }),
            ...StandardErrorResponses,
          },
        },
      )
      // ── One session's retained recording ──────────────────────────────
      // A separate call on purpose (design D10, task 4.5). The address is
      // minted for ONE session at a time and lives one hour, so a paginated
      // list mints nothing; the detail response says only WHETHER material
      // exists. A browser media element cannot send a bearer header, so the
      // API never proxies the bytes, object storage serves them, Range
      // requests included.
      .get(
        "/reports/:reportId/recording-url",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const me = await coachService.getMe(currentUserId);
          if (!me) throw new ForbiddenError("Not a coaching account");
          const url = await coachService.mintRetainedUrl({
            reportId: params.reportId,
            requesterCoachId: me.profile?.id ?? null,
            isAdmin: me.isAdmin,
            kind: "recording",
          });
          // One answer for every refusal, not this leader's session, no
          // session, no retained asset. A 'you may not' that reads differently
          // from a 'there is nothing' tells an unrelated leader which sessions
          // exist.
          if (!url) throw new NotFoundError("No retained recording");
          return { url, expiresInSeconds: MINTED_URL_LIFETIME_SECONDS };
        },
        {
          beforeHandle: mintRateLimit,
          response: {
            200: t.Object({
              url: t.String(),
              expiresInSeconds: t.Number(),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/reports/:reportId/transcript-url",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const me = await coachService.getMe(currentUserId);
          if (!me) throw new ForbiddenError("Not a coaching account");
          const url = await coachService.mintRetainedUrl({
            reportId: params.reportId,
            requesterCoachId: me.profile?.id ?? null,
            isAdmin: me.isAdmin,
            kind: "transcript",
          });
          if (!url) throw new NotFoundError("No retained transcript");
          return { url, expiresInSeconds: MINTED_URL_LIFETIME_SECONDS };
        },
        {
          beforeHandle: mintRateLimit,
          response: {
            200: t.Object({
              url: t.String(),
              expiresInSeconds: t.Number(),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/uploads/classes",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const coachId = await coachService.leaderIdFor(currentUserId);
          if (!coachId) throw new ForbiddenError("Not a coaching account");
          return {
            classes: (await coachService.uploads().classesFor(coachId)) ?? [],
          };
        },
        {
          response: {
            200: t.Object({ classes: t.Array(UploadClassSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/uploads",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const coachId = await coachService.leaderIdFor(currentUserId);
          if (!coachId) throw new ForbiddenError("Not a coaching account");
          return { uploads: await coachService.uploads().list(coachId) };
        },
        {
          response: {
            200: t.Object({ uploads: t.Array(UploadViewSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/uploads",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const coachId = await coachService.leaderIdFor(currentUserId);
          if (!coachId) throw new ForbiddenError("Not a coaching account");
          const asked = await coachService.uploads().request({
            ...body,
            coachId,
            byUserId: currentUserId,
            byAdmin: false,
          });
          if (!asked.ok) throw refuse("POST /coach/uploads", asked.refusal);
          const { ok: _ok, ...parts } = asked;
          return parts;
        },
        {
          body: UploadRequestBodySchema,
          response: { 200: UploadPartsSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/uploads/:id/parts",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const coachId = await coachService.leaderIdFor(currentUserId);
          if (!coachId) throw new ForbiddenError("Not a coaching account");
          const parts = await coachService
            .uploads()
            .refreshParts(params.id, coachId);
          if (!parts)
            throw refuse("POST /coach/uploads/:id/parts", "unknown-upload");
          return parts;
        },
        {
          params: t.Object({ id: t.String() }),
          response: { 200: UploadPartsSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/uploads/:id/complete",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const coachId = await coachService.leaderIdFor(currentUserId);
          if (!coachId) throw new ForbiddenError("Not a coaching account");
          const done = await coachService
            .uploads()
            .complete(params.id, coachId);
          if (!done.ok)
            throw refuse("POST /coach/uploads/:id/complete", done.refusal);
          return { status: done.status };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ status: UploadViewSchema.properties.status }),
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
      // The signed-in leader's own monthly summary (full parity with the
      // individual monthly PDF) for a YYYY-MM month.
      .get(
        "/monthly-summary",
        async ({ query, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          const month = (query.month ?? "").trim();
          if (!/^\d{4}-\d{2}$/.test(month))
            throw new ValidationError("month must be YYYY-MM");
          const data = await coachService.getMyMonthlySummary(
            currentUserId,
            month,
          );
          if (!data) throw new ForbiddenError("Not a coaching account");
          return data;
        },
        {
          query: t.Object({ month: t.String() }),
          response: {
            200: LeaderMonthlyResponseSchema,
            ...StandardErrorResponses,
          },
        },
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
      //
      // Pending re-share requests (tasks 6.3b, 8.5a). Admin-guarded because
      // sending emails a leader in VerseMate's name: an unguarded endpoint
      // would let anyone who knows a session id do that.
      // Dimension review and correction (task 5.7). Admin-guarded: it changes
      // the score a leader will be shown.
      .get(
        "/admin/reports/:reportId/review",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const state = await coachService.reviewReport(params.reportId);
          if (!state)
            throw refuse(
              "GET /coach/admin/reports/:reportId/review",
              "unknown-report",
            );
          return state;
        },
        { response: { 200: ReviewStateSchema, ...StandardErrorResponses } },
      )
      .post(
        "/admin/reports/:reportId/dimensions/:dimensionN",
        async ({ store: { coachService }, currentUserId, params, body }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const dimensionN = Number(params.dimensionN);
          if (
            !/^\d+$/.test(params.dimensionN) ||
            dimensionN < 1 ||
            dimensionN > 12
          )
            throw refuse(
              "POST /coach/admin/reports/:reportId/dimensions/:dimensionN",
              "invalid-dimension",
            );
          const result = await coachService.correctDimension({
            reportId: params.reportId,
            dimensionN,
            score: body.score ?? null,
            rationale: body.rationale,
            correctedByUserId: currentUserId,
          });
          if (!result.ok)
            throw refuse(
              "POST /coach/admin/reports/:reportId/dimensions/:dimensionN",
              result.refusal ?? "unknown",
            );
          return {
            base: result.base ?? 0,
            score: result.score ?? 0,
            status: result.status?.label ?? "",
          };
        },
        {
          body: t.Object({
            score: t.Union([t.Null(), t.Integer({ minimum: 1, maximum: 5 })]),
            rationale: t.String({ maxLength: 4000 }),
          }),
          response: {
            200: t.Object({
              base: t.Number(),
              score: t.Number(),
              status: t.String(),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/reports/:reportId/first-lesson",
        async ({ store: { coachService }, currentUserId, params, body }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return revisionResponse(
            "PUT /coach/admin/reports/:reportId/first-lesson",
            await coachService.setFirstLesson({
              reportId: params.reportId,
              firstLesson: body.firstLesson,
              score: body.score ?? null,
              rationale: body.rationale,
              bigIdeasReview: body.bigIdeasReview,
              byUserId: currentUserId,
            }),
          );
        },
        {
          body: t.Object({
            firstLesson: t.Boolean(),
            score: t.Optional(
              t.Union([t.Integer({ minimum: 1, maximum: 5 }), t.Null()]),
            ),
            rationale: t.Optional(t.String({ maxLength: 4000 })),
            bigIdeasReview: t.Optional(BigIdeasReviewRowSchema),
          }),
          response: {
            200: RevisionResultSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/reports/:reportId/improvements",
        async ({ store: { coachService }, currentUserId, params, body }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return revisionResponse(
            "PUT /coach/admin/reports/:reportId/improvements",
            await coachService.editImprovements({
              reportId: params.reportId,
              improvements: body.improvements,
              improvementsProse: body.improvementsProse,
              byUserId: currentUserId,
            }),
          );
        },
        {
          body: ImprovementsEditBodySchema,
          response: {
            200: RevisionResultSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/reports/:reportId/amend",
        async ({ store: { coachService }, currentUserId, params, body }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return revisionResponse(
            "POST /coach/admin/reports/:reportId/amend",
            await coachService.amendReport({
              reportId: params.reportId,
              amendment: body,
              byUserId: currentUserId,
            }),
          );
        },
        {
          body: AmendmentBodySchema,
          response: {
            200: RevisionResultSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/reports/:reportId/revisions",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return {
            revisions: await coachService.listRevisions(params.reportId),
          };
        },
        {
          response: {
            200: RevisionsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/reports/:reportId/revision/send",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const result = await coachService.sendRevision(params.reportId);
          if (
            result.refusal &&
            result.refusal in
              COACH_REFUSALS[
                "POST /coach/admin/reports/:reportId/revision/send"
              ]
          )
            throw refuse(
              "POST /coach/admin/reports/:reportId/revision/send",
              result.refusal,
            );
          return result;
        },
        {
          response: {
            200: RevisionSendSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/reports/:reportId/revision/requeue",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (!(await coachService.requeueRevision(params.reportId)))
            throw refuse(
              "POST /coach/admin/reports/:reportId/revision/requeue",
              "nothing-to-requeue",
            );
          return { requeued: true };
        },
        {
          response: {
            200: t.Object({ requeued: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      // Recording-bot coverage, the gate task 9.1 reads before retiring the
      // old host (task 4.7).
      .get(
        "/admin/coverage",
        async ({ store: { coachService }, currentUserId, query }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const report = await coachService.assessCoverage(
            query.windowDays ?? 30,
          );
          return {
            windowDays: report.windowDays,
            allCovered: report.allCovered,
            leaders: report.leaders,
          };
        },
        {
          query: t.Object({
            windowDays: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })),
          }),
          response: { 200: CoverageReportSchema, ...StandardErrorResponses },
        },
      )
      .get(
        "/admin/parallel-run/comparison",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return coachService.parallelRunComparison();
        },
        {
          response: {
            200: ParallelRunComparisonSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/leaders/:id/not-teaching",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (
            !(await coachService.setNotTeaching(params.id, true, currentUserId))
          )
            throw refuse(
              "POST /coach/admin/leaders/:id/not-teaching",
              "unknown-leader",
            );
          return { attested: true };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ attested: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/admin/leaders/:id/not-teaching",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (
            !(await coachService.setNotTeaching(
              params.id,
              false,
              currentUserId,
            ))
          )
            throw refuse(
              "DELETE /coach/admin/leaders/:id/not-teaching",
              "unknown-leader",
            );
          return { attested: false };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ attested: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/uploads/classes",
        async ({ query, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const classes = await coachService
            .uploads()
            .classesFor(query.coachId);
          if (!classes)
            throw refuse("GET /coach/admin/uploads/classes", "unknown-leader");
          return { classes };
        },
        {
          query: t.Object({ coachId: t.String({ maxLength: 200 }) }),
          response: {
            200: t.Object({ classes: t.Array(UploadClassSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/uploads",
        async ({ query, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return {
            uploads: await coachService.uploads().list(query.coachId ?? null),
          };
        },
        {
          query: t.Object({
            coachId: t.Optional(t.String({ maxLength: 200 })),
          }),
          response: {
            200: t.Object({ uploads: t.Array(UploadViewSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/uploads",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const { coachId, replace, ...file } = body;
          const asked = await coachService.uploads().request({
            ...file,
            coachId,
            replace: replace === true,
            byUserId: currentUserId,
            byAdmin: true,
          });
          if (!asked.ok)
            throw refuse("POST /coach/admin/uploads", asked.refusal);
          const { ok: _ok, ...parts } = asked;
          return parts;
        },
        {
          body: t.Composite([
            UploadRequestBodySchema,
            t.Object({
              coachId: t.String({ maxLength: 200 }),
              replace: t.Optional(t.Boolean()),
            }),
          ]),
          response: { 200: UploadPartsSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/admin/uploads/:id/parts",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const parts = await coachService
            .uploads()
            .refreshParts(params.id, null);
          if (!parts)
            throw refuse(
              "POST /coach/admin/uploads/:id/parts",
              "unknown-upload",
            );
          return parts;
        },
        {
          params: t.Object({ id: t.String() }),
          response: { 200: UploadPartsSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/admin/uploads/:id/complete",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const done = await coachService.uploads().complete(params.id, null);
          if (!done.ok)
            throw refuse(
              "POST /coach/admin/uploads/:id/complete",
              done.refusal,
            );
          return { status: done.status };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ status: UploadViewSchema.properties.status }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/duplicates",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return {
            duplicates: await coachService.uploads().likelyDuplicates(),
          };
        },
        {
          response: {
            200: t.Object({ duplicates: t.Array(LikelyDuplicateSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/duplicates/:sourceSessionId/dismiss",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (
            !(await coachService
              .uploads()
              .dismissDuplicate(params.sourceSessionId))
          )
            throw refuse(
              "POST /coach/admin/duplicates/:sourceSessionId/dismiss",
              "not-a-duplicate",
            );
          return { dismissed: true };
        },
        {
          params: t.Object({ sourceSessionId: t.String() }),
          response: {
            200: t.Object({ dismissed: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/duplicates/:sourceSessionId/score",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const scored = await coachService
            .uploads()
            .scoreInstead(params.sourceSessionId);
          if (!scored.ok)
            throw refuse(
              "POST /coach/admin/duplicates/:sourceSessionId/score",
              scored.refusal,
            );
          return { queued: true };
        },
        {
          params: t.Object({ sourceSessionId: t.String() }),
          response: {
            200: t.Object({ queued: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/identity-audit",
        async ({ store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return new CoachIdentityService(store.db, store.notification).audit();
        },
        {
          response: {
            200: IdentityAuditSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/admins",
        async ({ store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return {
            admins: await new CoachIdentityService(store.db, null).listAdmins(),
          };
        },
        {
          response: {
            200: t.Object({
              admins: t.Array(
                t.Object({
                  email: t.String(),
                  bound: t.Boolean(),
                  grantedAt: t.String(),
                }),
              ),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/admins",
        async ({ body, store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const granted = await new CoachIdentityService(
            store.db,
            null,
          ).grantAdmin(body.email, currentUserId);
          if (!granted.ok)
            throw refuse("POST /coach/admin/admins", granted.refusal);
          return { granted: true };
        },
        {
          body: t.Object({ email: t.String({ maxLength: 254 }) }),
          response: {
            200: t.Object({ granted: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/admin/admins/:email",
        async ({ params, store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const revoked = await new CoachIdentityService(
            store.db,
            null,
          ).revokeAdmin(decodeURIComponent(params.email));
          if (!revoked.ok)
            throw refuse("DELETE /coach/admin/admins/:email", revoked.refusal);
          return { revoked: true };
        },
        {
          params: t.Object({ email: t.String() }),
          response: {
            200: t.Object({ revoked: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/identity-nudges",
        async ({ store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const result = await new CoachIdentityService(
            store.db,
            store.notification,
          ).nudge();
          if (result.refusal)
            throw refuse("POST /coach/admin/identity-nudges", result.refusal);
          return result;
        },
        {
          response: {
            200: t.Object({
              sent: t.Array(t.String()),
              skipped: t.Array(t.String()),
              failed: t.Array(t.String()),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/monthly-reports",
        async ({ query, store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const rows = await new CoachMonthlyService(
            store.db,
            () => getAiProvider(),
            store.notification,
          ).list(query.month);
          return { reports: rows as never };
        },
        {
          query: t.Object({ month: t.Optional(t.String({ maxLength: 7 })) }),
          response: {
            200: t.Object({ reports: t.Array(MonthlyReportRowSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/monthly-reports/:id",
        async ({ params, body, store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const id = Number(params.id);
          const edited = Number.isInteger(id)
            ? await new CoachMonthlyService(
                store.db,
                () => getAiProvider(),
                store.notification,
              ).edit(id, body)
            : ({ ok: false, refusal: "unknown-summary" } as const);
          if (!edited.ok)
            throw refuse(
              "PUT /coach/admin/monthly-reports/:id",
              edited.refusal,
            );
          return { edited: true };
        },
        {
          params: t.Object({ id: t.String() }),
          body: MonthlyReportEditSchema,
          response: {
            200: t.Object({ edited: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/monthly-reports/:id/release",
        async ({ params, store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const id = Number(params.id);
          const released = Number.isInteger(id)
            ? await new CoachMonthlyService(
                store.db,
                () => getAiProvider(),
                store.notification,
              ).release(id)
            : ({ released: false, refusal: "unknown-summary" } as const);
          if (!released.released)
            throw refuse(
              "POST /coach/admin/monthly-reports/:id/release",
              released.refusal,
            );
          return { released: true, sent: released.sent };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ released: t.Boolean(), sent: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/monthly-reports/produce",
        async ({ body, store, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await store.coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (!/^\d{4}-\d{2}$/.test(body.month))
            throw refuse(
              "POST /coach/admin/monthly-reports/produce",
              "invalid-month",
            );
          return new CoachMonthlyService(
            store.db,
            () => getAiProvider(),
            store.notification,
          ).produce(body.month);
        },
        {
          body: t.Object({ month: t.String({ maxLength: 7 }) }),
          response: {
            200: t.Object({ produced: t.Number() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/rotating-classes",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return { classes: await coachService.listRotatingClasses() };
        },
        {
          response: {
            200: t.Object({ classes: t.Array(RotatingClassSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/rotating-classes",
        async ({ body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (!isEmailAddress(body.groupEmail.trim().toLowerCase()))
            throw refuse(
              "POST /coach/admin/rotating-classes",
              "invalid-address",
            );
          const saved = await coachService.saveRotatingClass(body);
          if (!saved.ok)
            throw refuse("POST /coach/admin/rotating-classes", saved.refusal);
          return { id: saved.id };
        },
        {
          body: RotatingClassBodySchema,
          response: {
            200: t.Object({ id: t.Number() }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/rotating-classes/:id",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (!isEmailAddress(body.groupEmail.trim().toLowerCase()))
            throw refuse(
              "PUT /coach/admin/rotating-classes/:id",
              "invalid-address",
            );
          const id = Number(params.id);
          const saved = Number.isInteger(id)
            ? await coachService.saveRotatingClass(body, id)
            : ({ ok: false, refusal: "unknown-class" } as const);
          if (!saved.ok)
            throw refuse(
              "PUT /coach/admin/rotating-classes/:id",
              saved.refusal,
            );
          return { id: saved.id };
        },
        {
          params: t.Object({ id: t.String() }),
          body: RotatingClassBodySchema,
          response: {
            200: t.Object({ id: t.Number() }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/leaders/:id/rotating-only",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (
            !(await coachService.setRotatingOnly(params.id, body.rotatingOnly))
          )
            throw refuse(
              "PUT /coach/admin/leaders/:id/rotating-only",
              "unknown-leader",
            );
          return { rotatingOnly: body.rotatingOnly };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({ rotatingOnly: t.Boolean() }),
          response: {
            200: t.Object({ rotatingOnly: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/reshares",
        async ({ store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          return { requests: await coachService.listPendingReshares() };
        },
        {
          response: {
            200: t.Object({
              requests: t.Array(
                t.Object({
                  sourceSessionId: t.String(),
                  coachId: t.Union([t.String(), t.Null()]),
                  title: t.String(),
                  sessionDate: t.String(),
                  sessionStartedAt: t.Union([t.Date(), t.Null()]),
                  requestedAt: t.Date(),
                  attempts: t.Number(),
                  asked: t.Boolean(),
                  parallelRun: t.Boolean(),
                }),
              ),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/pipeline-failures",
        async ({ store: { coachService }, currentUserId, query }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const limit = query.limit ?? PIPELINE_FAILURES_PAGE;
          const offset = query.offset ?? 0;
          const page = await coachService.listPipelineFailures({
            limit,
            offset,
          });
          return { ...page, limit, offset };
        },
        {
          query: t.Object({
            limit: t.Optional(
              t.Numeric({ minimum: 1, maximum: PIPELINE_FAILURES_MAX }),
            ),
            offset: t.Optional(t.Numeric({ minimum: 0 })),
          }),
          response: {
            200: t.Object({
              total: t.Number(),
              limit: t.Number(),
              offset: t.Number(),
              sessions: t.Array(
                t.Object({
                  sourceSessionId: t.String(),
                  coachId: t.Union([t.String(), t.Null()]),
                  title: t.String(),
                  sessionDate: t.String(),
                  sessionStartedAt: t.Union([t.Date(), t.Null()]),
                  state: t.String(),
                  attempts: t.Number(),
                  reportId: t.Union([t.String(), t.Null()]),
                  reason: t.Union([t.String(), t.Null()]),
                  holdKind: t.Union([t.UnionEnum(HOLD_KINDS), t.Null()]),
                  coldRecall: t.Optional(t.Array(t.String())),
                  action: t.Union([
                    t.Literal("release"),
                    t.Literal("requeue"),
                    t.Literal("attribute"),
                    t.Null(),
                  ]),
                  parallelRun: t.Boolean(),
                  updatedAt: t.Date(),
                }),
              ),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/reports/:reportId/release",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const result = await coachService.releaseHeldReport(params.reportId);
          if (
            result.refusal &&
            result.refusal in
              COACH_REFUSALS["POST /coach/admin/reports/:reportId/release"]
          )
            throw refuse(
              "POST /coach/admin/reports/:reportId/release",
              result.refusal,
            );
          return result;
        },
        {
          response: {
            200: t.Object({
              delivered: t.Boolean(),
              refusal: t.Optional(t.String()),
              violations: t.Optional(t.Array(t.String())),
              coldRecall: t.Optional(t.Array(t.String())),
              skipped: t.Optional(t.Array(t.String())),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/pipeline-failures/:sourceSessionId/requeue",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const requeued = await coachService.requeuePipelineFailure(
            params.sourceSessionId,
          );
          if (requeued === "parallel-run-session" || !requeued)
            throw refuse(
              "POST /coach/admin/pipeline-failures/:sourceSessionId/requeue",
              requeued === "parallel-run-session"
                ? "parallel-run-session"
                : "not-parked",
            );
          return { requeued: true };
        },
        {
          response: {
            200: t.Object({ requeued: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/reshares/:sourceSessionId/send",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const result = await coachService.sendReshareRequest(
            params.sourceSessionId,
          );
          if (!result.sent)
            throw refuse(
              "POST /coach/admin/reshares/:sourceSessionId/send",
              result.refusal ?? "send-failed",
            );
          return { sent: true };
        },
        {
          response: {
            200: t.Object({ sent: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/reshares/:sourceSessionId/resolve",
        async ({ store: { coachService }, currentUserId, params }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const cleared = await coachService.resolveReshare(
            params.sourceSessionId,
          );
          if (!cleared)
            throw refuse(
              "POST /coach/admin/reshares/:sourceSessionId/resolve",
              "not-pending",
            );
          // The session re-enters retrieval; intake idempotence means the
          // report it eventually produces is not a duplicate.
          return { resolved: true };
        },
        {
          response: {
            200: t.Object({ resolved: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
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
        "/admin/coaches/:id/reports/summary",
        async ({ params, query, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (!(await coachService.getProfileById(params.id)))
            throw refuse(
              "GET /coach/admin/coaches/:id/reports/summary",
              "unknown-leader",
            );
          return coachService.getReportSummaries(
            params.id,
            { limit: query.limit, offset: query.offset },
            "admin",
          );
        },
        {
          params: t.Object({ id: t.String() }),
          query: PageQuery,
          response: {
            200: SummaryPageSchema,
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/coaches/:id/reports/:reportId",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const report = await coachService.getReportDetail(
            params.id,
            params.reportId,
            "admin",
          );
          if (!report)
            throw refuse(
              "GET /coach/admin/coaches/:id/reports/:reportId",
              "unknown-report",
            );
          return { report };
        },
        {
          params: t.Object({ id: t.String(), reportId: t.String() }),
          response: {
            200: t.Object({ report: ReportSchema }),
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
          if (!trends)
            throw refuse(
              "GET /coach/admin/coaches/:id/trends",
              "unknown-leader",
            );
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
      // A specific leader's monthly summary (admin drill-in) for a YYYY-MM month.
      .get(
        "/admin/coaches/:id/monthly-summary",
        async ({ params, query, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const month = (query.month ?? "").trim();
          if (!/^\d{4}-\d{2}$/.test(month))
            throw refuse(
              "GET /coach/admin/coaches/:id/monthly-summary",
              "invalid-month",
            );
          const data = await coachService.getMonthlySummaryById(
            params.id,
            month,
          );
          if (!data)
            throw refuse(
              "GET /coach/admin/coaches/:id/monthly-summary",
              "unknown-leader",
            );
          return data;
        },
        {
          params: t.Object({ id: t.String() }),
          query: t.Object({ month: t.String() }),
          response: {
            200: LeaderMonthlyResponseSchema,
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      // Every leader's classes + owner identity, the single feed the Fireflies
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
          if (!isEmailAddress(email))
            throw refuse("POST /coach/admin/leaders", "invalid-address");
          const result = await coachService.addLeader(currentUserId, {
            email,
            name: body.name,
            group: body.group,
            coachName: body.coachName,
          });
          if (result.ok) return { coach: result.coach };
          if (result.reason === "slug-taken")
            throw refuse("POST /coach/admin/leaders", "slug-taken", {
              message: `Another leader already uses the id "${result.slug}". Enter a different name.`,
              details: { slug: result.slug },
            });
          if (result.reason === "no-slug")
            throw refuse("POST /coach/admin/leaders", "no-slug");
          if (result.reason === "group-address")
            throw refuse("POST /coach/admin/leaders", "group-address");
          if (result.reason === "keyword-conflict")
            throw refuse("POST /coach/admin/leaders", "keyword-conflict", {
              details: { conflicts: result.conflicts },
              message: `Name refused: ${result.conflicts
                .map(
                  (c) => `it contains "${c.keyword}", a keyword of ${c.leader}`,
                )
                .join(
                  "; ",
                )}. Their sessions would be routed to that leader. Enter a different name or change that leader's keywords first.`,
            });
          throw refuse("POST /coach/admin/leaders", "email-taken");
        },
        {
          body: AddLeaderDto,
          response: {
            200: t.Object({ coach: CoachSummarySchema }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/leaders/:id/attribution",
        async ({ params, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const attribution = await coachService.getLeaderAttribution(
            params.id,
          );
          if (!attribution)
            throw refuse(
              "GET /coach/admin/leaders/:id/attribution",
              "unknown-leader",
            );
          return attribution;
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({
              titleMatch: t.Array(t.String()),
              altEmails: t.Array(t.String()),
            }),
            404: t.Object({ error: t.String(), message: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/leaders/:id/attribution",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          if (body.titleMatch.some((k) => k.trim().length < 3))
            throw refuse(
              "PUT /coach/admin/leaders/:id/attribution",
              "keyword-too-short",
            );
          const badAlt = body.altEmails.find(
            (e) => !isEmailAddress(e.trim().toLowerCase()),
          );
          if (badAlt !== undefined)
            throw refuse(
              "PUT /coach/admin/leaders/:id/attribution",
              "invalid-alternate-address",
              {
                message: `Alternate address "${badAlt}": ${EMAIL_RULE}`,
                details: { address: badAlt },
              },
            );
          const result = await coachService.setLeaderAttribution(params.id, {
            titleMatch: body.titleMatch,
            altEmails: body.altEmails,
          });
          if (result.ok === false && result.refusal === "keyword-conflict")
            throw refuse(
              "PUT /coach/admin/leaders/:id/attribution",
              "keyword-conflict",
              {
                details: { conflicts: result.conflicts },
                message: `Keywords refused: ${result.conflicts
                  .map(
                    (c) =>
                      `"${c.keyword}" is inside ${c.inside === "name" ? "the name" : "a keyword"} of ${c.leader}`,
                  )
                  .join("; ")}`,
              },
            );
          if (!result.ok)
            throw refuse(
              "PUT /coach/admin/leaders/:id/attribution",
              "unknown-leader",
            );
          return {
            titleMatch: result.titleMatch,
            altEmails: result.altEmails,
            resolved: result.resolved,
          };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            titleMatch: t.Array(t.String({ maxLength: 100 }), {
              maxItems: 50,
            }),
            altEmails: t.Array(t.String({ maxLength: 254 }), { maxItems: 20 }),
          }),
          response: {
            200: t.Object({
              titleMatch: t.Array(t.String()),
              altEmails: t.Array(t.String()),
              resolved: t.Number(),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/admin/leaders/:id/email",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const email = body.email.trim().toLowerCase();
          if (!isEmailAddress(email))
            throw refuse(
              "PUT /coach/admin/leaders/:id/email",
              "invalid-address",
            );
          const result = await coachService.updateLeaderEmail(
            params.id,
            email,
            {
              byUserId: currentUserId,
              confirm: body.confirm === true,
            },
          );
          if (result.ok)
            return {
              email: result.email,
              status: result.status,
              expiresAt: result.expiresAt,
              confirmationSent: result.confirmationSent,
            };
          throw refuse("PUT /coach/admin/leaders/:id/email", result.refusal);
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            email: t.String({ maxLength: 254 }),
            confirm: t.Optional(t.Boolean()),
          }),
          response: {
            200: t.Object({
              email: t.String(),
              status: t.Union([t.Literal("pending"), t.Literal("unchanged")]),
              expiresAt: t.Union([t.String(), t.Null()]),
              confirmationSent: t.Boolean(),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/sessions/:sourceSessionId/attribute",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const result = await coachService.reattributeSession(
            params.sourceSessionId,
            body.coachId,
            body.expectedCoachId,
          );
          if (result.ok) return { coachId: body.coachId, state: result.state };
          throw refuse(
            "POST /coach/admin/sessions/:sourceSessionId/attribute",
            result.refusal,
          );
        },
        {
          params: t.Object({ sourceSessionId: t.String() }),
          body: t.Object({
            coachId: t.String({ minLength: 1 }),
            expectedCoachId: t.Union([t.String({ minLength: 1 }), t.Null()]),
          }),
          response: {
            200: t.Object({ coachId: t.String(), state: t.String() }),
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
            throw refuse(
              "PUT /coach/admin/coaches/:id/reports/:reportId/recording",
              "invalid-link",
            );
          const saved = await coachService.setRecordingLink(
            params.id,
            params.reportId,
            recordingUrl,
          );
          if (saved === null)
            throw refuse(
              "PUT /coach/admin/coaches/:id/reports/:reportId/recording",
              "unknown-report",
            );
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
      // Write a coaching note on a session, persisted + emailed to the leader.
      .post(
        "/admin/coaches/:id/reports/:reportId/notes",
        async ({ params, body, store: { coachService }, currentUserId }) => {
          if (!currentUserId)
            throw new UnauthorizedError("Authentication required");
          if (!(await coachService.isAdmin(currentUserId)))
            throw new ForbiddenError("Admin access required");
          const text = body.body.trim();
          if (!text)
            throw refuse(
              "POST /coach/admin/coaches/:id/reports/:reportId/notes",
              "empty-note",
            );
          const note = await coachService.addNote(
            params.id,
            params.reportId,
            currentUserId,
            text,
          );
          if (note === null || note === "held")
            throw refuse(
              "POST /coach/admin/coaches/:id/reports/:reportId/notes",
              note === "held" ? "held" : "unknown-report",
            );
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
            throw refuse("GET /coach/admin/monthly", "invalid-month");
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
