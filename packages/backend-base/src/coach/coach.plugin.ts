import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { ForbiddenError, UnauthorizedError } from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import { CoachService } from "./coach.service";
import { UpdateZoomLinkDto } from "./dto/coach.dto";

// ─── Response schemas ──────────────────────────────────────────────────────

const ClusterSchema = t.Object({
  name: t.String(),
  weight: t.Number(),
  scorePct: t.Union([t.Number(), t.Null()]),
  contribution: t.Number(),
});

const DimensionSchema = t.Object({
  n: t.Number(),
  name: t.String(),
  score: t.Union([t.Number(), t.Null()]),
});

const ReportSchema = t.Object({
  id: t.String(),
  date: t.String(),
  dateLabel: t.String(),
  session: t.String(),
  topic: t.String(),
  duration: t.String(),
  attendees: t.Number(),
  newcomers: t.Number(),
  score: t.Number(),
  base: t.Number(),
  newcomerBonus: t.Number(),
  sizeBonus: t.Number(),
  status: t.String(),
  statusEmoji: t.String(),
  clusters: t.Array(ClusterSchema),
  dimensions: t.Array(DimensionSchema),
  bigIdeas: t.Array(t.String()),
  docUrl: t.String(),
  pdfUrl: t.String(),
});

const MeSchema = t.Object({
  isCoach: t.Literal(true),
  profile: t.Object({
    id: t.String(),
    name: t.String(),
    email: t.String(),
    group: t.String(),
    coachName: t.String(),
  }),
  zoomLink: t.String(),
  model: t.String(),
  clusters: t.Array(t.Object({ name: t.String(), weight: t.Number() })),
  statusBands: t.Array(
    t.Object({ min: t.Number(), label: t.String(), emoji: t.String() }),
  ),
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
  .state((state) => ({
    ...state,
    coachService: new CoachService(state.db),
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
      ),
  );

export type CoachPlugin = typeof plugin;

export default plugin;
