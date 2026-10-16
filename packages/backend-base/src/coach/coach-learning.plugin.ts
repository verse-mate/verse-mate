import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { clientBucket } from "../common/client-ip";
import { createErrorHandler } from "../common/error-handler";
import { ForbiddenError, UnauthorizedError } from "../common/errors";
import { createRateLimit } from "../common/rate-limit.middleware";
import { StandardErrorResponses } from "../common/response-schemas";
import shared from "../shared/shared.plugin";
import { CoachLearningService, LEARNERS_PAGE } from "./coach-learning.service";
import { CoachService } from "./coach.service";

const Nullable = <T extends Parameters<typeof t.Union>[0][number]>(s: T) =>
  t.Union([s, t.Null()]);

const ContinueSchema = Nullable(
  t.Union([
    t.Object({
      kind: t.Literal("lesson"),
      lessonId: t.Number(),
      moduleId: t.Number(),
    }),
    t.Object({ kind: t.Literal("check"), moduleId: t.Number() }),
  ]),
);

const RequestStatus = t.Union([
  t.Literal("open"),
  t.Literal("approved"),
  t.Literal("declined"),
  t.Literal("already-in-program"),
]);

const JoinRequestSchema = t.Object({
  id: t.Number(),
  status: RequestStatus,
  reason: Nullable(t.String()),
  note: t.String(),
  sentAt: t.String(),
  answeredAt: Nullable(t.String()),
});

const ProgramStateSchema = t.Object({
  open: t.Boolean(),
  enrolledAt: Nullable(t.String()),
  completedAt: Nullable(t.String()),
  passed: t.Number(),
  total: t.Number(),
  next: ContinueSchema,
  modules: t.Array(
    t.Object({
      id: t.Number(),
      title: t.String(),
      description: t.String(),
      passMark: t.Number(),
      state: t.Union([
        t.Literal("locked"),
        t.Literal("open"),
        t.Literal("passed"),
      ]),
      bestScore: Nullable(t.Number()),
      questionCount: t.Number(),
      lessons: t.Array(
        t.Object({
          id: t.Number(),
          title: t.String(),
          state: t.Union([
            t.Literal("locked"),
            t.Literal("open"),
            t.Literal("done"),
          ]),
        }),
      ),
    }),
  ),
  isLeader: t.Boolean(),
  addressConfirmed: t.Boolean(),
  request: Nullable(JoinRequestSchema),
});

const PassageOut = t.Object({
  bookId: t.Number(),
  bookName: t.String(),
  chapter: t.Number(),
  verseStart: Nullable(t.Number()),
  verseEnd: Nullable(t.Number()),
});

const LessonSchema = t.Object({
  id: t.Number(),
  moduleId: t.Number(),
  moduleTitle: t.String(),
  title: t.String(),
  body: t.String(),
  passages: t.Array(PassageOut),
  hasVideo: t.Boolean(),
  done: t.Boolean(),
  draft: t.Boolean(),
});

const VideoUrlSchema = t.Object({
  url: t.String(),
  type: t.String(),
  expiresInSeconds: t.Number(),
});

const CheckSchema = t.Object({
  moduleId: t.Number(),
  title: t.String(),
  passMark: t.Number(),
  version: t.Number(),
  passed: t.Boolean(),
  bestScore: Nullable(t.Number()),
  questions: t.Array(
    t.Object({
      id: t.Number(),
      prompt: t.String(),
      options: t.Array(t.String()),
    }),
  ),
});

const GradeSchema = t.Object({
  score: t.Number(),
  correct: t.Number(),
  total: t.Number(),
  passed: t.Boolean(),
  passMark: t.Number(),
  wrong: t.Array(t.Number()),
  bestScore: Nullable(t.Number()),
  modulePassed: t.Boolean(),
});

const PassageIn = t.Object({
  bookId: t.Integer(),
  chapter: t.Integer(),
  verseStart: t.Optional(Nullable(t.Integer())),
  verseEnd: t.Optional(Nullable(t.Integer())),
});

const ModuleBody = t.Object({
  title: t.String({ maxLength: 200 }),
  description: t.String({ maxLength: 2000 }),
  passMark: t.Integer({ minimum: 1, maximum: 100 }),
});

const LessonBody = t.Object({
  title: t.String({ maxLength: 200 }),
  body: t.String({ maxLength: 100_000 }),
  passages: t.Array(PassageIn, { maxItems: 20 }),
});

const QuestionBody = t.Object({
  prompt: t.String({ maxLength: 1000 }),
  options: t.Array(t.String({ maxLength: 500 }), { maxItems: 10 }),
  correct: t.Integer(),
});

const OrderBody = t.Object({
  ids: t.Array(t.Integer(), { maxItems: 500 }),
});

const AdminTreeSchema = t.Object({
  modules: t.Array(
    t.Object({
      id: t.Number(),
      title: t.String(),
      description: t.String(),
      passMark: t.Number(),
      published: t.Boolean(),
      checkVersion: t.Number(),
      used: t.Boolean(),
      lessons: t.Array(
        t.Object({
          id: t.Number(),
          title: t.String(),
          body: t.String(),
          passages: t.Array(PassageOut),
          published: t.Boolean(),
          hasVideo: t.Boolean(),
          videoType: Nullable(t.String()),
          used: t.Boolean(),
        }),
      ),
      questions: t.Array(
        t.Object({
          id: t.Number(),
          prompt: t.String(),
          options: t.Array(t.String()),
          correct: t.Number(),
        }),
      ),
    }),
  ),
});

const OpenRequestSchema = t.Object({
  id: t.Number(),
  name: t.String(),
  email: t.String(),
  note: t.String(),
  sentAt: t.String(),
  completedAt: Nullable(t.String()),
  scores: t.Array(
    t.Object({
      moduleId: t.Number(),
      title: t.String(),
      bestScore: Nullable(t.Number()),
    }),
  ),
});

const LearnersSchema = t.Object({
  total: t.Number(),
  limit: t.Number(),
  offset: t.Number(),
  learners: t.Array(
    t.Object({
      name: t.String(),
      email: t.String(),
      enrolledAt: t.String(),
      completedAt: Nullable(t.String()),
      passed: t.Number(),
      total: t.Number(),
      request: Nullable(t.String()),
    }),
  ),
});

const Ok = t.Object({ ok: t.Boolean() });
const Created = t.Object({ id: t.Number() });
const IdParam = t.Object({ id: t.Numeric() });
const ok = { ok: true };

const learningRateLimit = createRateLimit({
  windowSeconds: 60,
  max: 120,
  keyGenerator: (context) =>
    `coach-learning:${context.currentUserId ?? `ip:${clientBucket(context.request, context.server)}`}`,
  message: "Too many requests, please try again in a minute",
});

const signedIn = (currentUserId: string | null | undefined): string => {
  if (!currentUserId) throw new UnauthorizedError("Authentication required");
  return currentUserId;
};

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("coach learning plugin"))
  .state((state) => ({
    ...state,
    learningService: new CoachLearningService(state.db),
    learningCoach: new CoachService(state.db, state.notification),
  }))
  .group("/coach", (app) =>
    app
      .resolve({ as: "scoped" }, authDerive)
      .onBeforeHandle(learningRateLimit)
      .derive(({ store }) => ({
        coach: () =>
          (store as unknown as { coachService?: CoachService }).coachService ??
          store.learningCoach,
      }))
      .resolve(({ currentUserId, coach }) => ({
        admin: async () => {
          const id = signedIn(currentUserId);
          if (!(await coach().isAdmin(id)))
            throw new ForbiddenError("Admin access required");
          return id;
        },
      }))
      .get(
        "/learning",
        ({ store: { learningService }, currentUserId, coach }) =>
          learningService.state(signedIn(currentUserId), coach()),
        { response: { 200: ProgramStateSchema, ...StandardErrorResponses } },
      )
      .post(
        "/learning/enrol",
        async ({ store: { learningService }, currentUserId, coach }) => {
          const id = signedIn(currentUserId);
          await learningService.enrol(id);
          return learningService.state(id, coach());
        },
        { response: { 200: ProgramStateSchema, ...StandardErrorResponses } },
      )
      .get(
        "/learning/lessons/:id",
        ({ store: { learningService }, currentUserId, params }) =>
          learningService.lesson(signedIn(currentUserId), params.id),
        {
          params: IdParam,
          response: { 200: LessonSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/learning/lessons/:id/done",
        async ({
          store: { learningService },
          currentUserId,
          params,
          coach,
        }) => {
          const id = signedIn(currentUserId);
          await learningService.markDone(id, params.id);
          return learningService.state(id, coach());
        },
        {
          params: IdParam,
          response: { 200: ProgramStateSchema, ...StandardErrorResponses },
        },
      )
      .get(
        "/learning/lessons/:id/video",
        async ({
          store: { learningService },
          currentUserId,
          params,
          coach,
        }) => {
          const id = signedIn(currentUserId);
          return learningService.videoUrl(
            id,
            params.id,
            await coach().isAdmin(id),
          );
        },
        {
          params: IdParam,
          response: { 200: VideoUrlSchema, ...StandardErrorResponses },
        },
      )
      .get(
        "/learning/modules/:id/check",
        ({ store: { learningService }, currentUserId, params }) =>
          learningService.check(signedIn(currentUserId), params.id),
        {
          params: IdParam,
          response: { 200: CheckSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/learning/modules/:id/check",
        ({ store: { learningService }, currentUserId, params, body }) =>
          learningService.submit(signedIn(currentUserId), params.id, body),
        {
          params: IdParam,
          body: t.Object({
            version: t.Integer(),
            answers: t.Array(
              t.Object({ questionId: t.Integer(), option: t.Integer() }),
              { maxItems: 100 },
            ),
          }),
          response: { 200: GradeSchema, ...StandardErrorResponses },
        },
      )
      .post(
        "/learning/join-request",
        async ({ store: { learningService }, currentUserId, body, coach }) => ({
          request: await learningService.sendRequest(
            signedIn(currentUserId),
            body.note ?? "",
            coach(),
          ),
        }),
        {
          body: t.Object({ note: t.Optional(t.String({ maxLength: 500 })) }),
          response: {
            200: t.Object({ request: Nullable(JoinRequestSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/learning",
        async ({ store: { learningService }, admin }) => {
          await admin();
          return { modules: await learningService.adminTree() };
        },
        { response: { 200: AdminTreeSchema, ...StandardErrorResponses } },
      )
      .post(
        "/admin/learning/modules",
        async ({ store: { learningService }, admin, body }) => {
          await admin();
          return learningService.createModule(body);
        },
        {
          body: ModuleBody,
          response: { 200: Created, ...StandardErrorResponses },
        },
      )
      .put(
        "/admin/learning/modules/order",
        async ({ store: { learningService }, admin, body }) => {
          await admin();
          await learningService.reorderModules(body.ids);
          return ok;
        },
        { body: OrderBody, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .put(
        "/admin/learning/modules/:id",
        async ({ store: { learningService }, admin, body, params }) => {
          await admin();
          await learningService.updateModule(params.id, body);
          return ok;
        },
        {
          params: IdParam,
          body: ModuleBody,
          response: { 200: Ok, ...StandardErrorResponses },
        },
      )
      .post(
        "/admin/learning/modules/:id/publish",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.publishModule(params.id, true);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .post(
        "/admin/learning/modules/:id/unpublish",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.publishModule(params.id, false);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .delete(
        "/admin/learning/modules/:id",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.deleteModule(params.id);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .post(
        "/admin/learning/modules/:id/lessons",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          return learningService.createLesson(params.id, body);
        },
        {
          params: IdParam,
          body: LessonBody,
          response: { 200: Created, ...StandardErrorResponses },
        },
      )
      .put(
        "/admin/learning/modules/:id/lessons/order",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          await learningService.reorderLessons(params.id, body.ids);
          return ok;
        },
        {
          params: IdParam,
          body: OrderBody,
          response: { 200: Ok, ...StandardErrorResponses },
        },
      )
      .post(
        "/admin/learning/modules/:id/questions",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          return learningService.createQuestion(params.id, body);
        },
        {
          params: IdParam,
          body: QuestionBody,
          response: { 200: Created, ...StandardErrorResponses },
        },
      )
      .put(
        "/admin/learning/modules/:id/questions/order",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          await learningService.reorderQuestions(params.id, body.ids);
          return ok;
        },
        {
          params: IdParam,
          body: OrderBody,
          response: { 200: Ok, ...StandardErrorResponses },
        },
      )
      .put(
        "/admin/learning/questions/:id",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          await learningService.updateQuestion(params.id, body);
          return ok;
        },
        {
          params: IdParam,
          body: QuestionBody,
          response: { 200: Ok, ...StandardErrorResponses },
        },
      )
      .delete(
        "/admin/learning/questions/:id",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.deleteQuestion(params.id);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .get(
        "/admin/learning/lessons/:id",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          return learningService.previewLesson(params.id);
        },
        {
          params: IdParam,
          response: { 200: LessonSchema, ...StandardErrorResponses },
        },
      )
      .put(
        "/admin/learning/lessons/:id",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          await learningService.updateLesson(params.id, body);
          return ok;
        },
        {
          params: IdParam,
          body: LessonBody,
          response: { 200: Ok, ...StandardErrorResponses },
        },
      )
      .post(
        "/admin/learning/lessons/:id/publish",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.publishLesson(params.id, true);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .post(
        "/admin/learning/lessons/:id/unpublish",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.publishLesson(params.id, false);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .delete(
        "/admin/learning/lessons/:id",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.deleteLesson(params.id);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .post(
        "/admin/learning/lessons/:id/video/upload",
        async ({ store: { learningService }, admin, params, body }) => {
          await admin();
          return learningService.videoUploadUrl(params.id, body);
        },
        {
          params: IdParam,
          body: t.Object({
            size: t.Integer({ minimum: 1 }),
            type: t.String({ maxLength: 100 }),
          }),
          response: {
            200: t.Object({ uploadUrl: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/learning/lessons/:id/video/attach",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          return learningService.attachVideo(params.id);
        },
        {
          params: IdParam,
          response: {
            200: t.Object({ type: t.String() }),
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/admin/learning/lessons/:id/video",
        async ({ store: { learningService }, admin, params }) => {
          await admin();
          await learningService.removeVideo(params.id);
          return ok;
        },
        { params: IdParam, response: { 200: Ok, ...StandardErrorResponses } },
      )
      .get(
        "/admin/learning/requests",
        async ({ store: { learningService }, admin }) => {
          await admin();
          return { requests: await learningService.openRequests() };
        },
        {
          response: {
            200: t.Object({ requests: t.Array(OpenRequestSchema) }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/learning/requests/:id/approve",
        async ({ store: { learningService }, admin, params, body, coach }) =>
          learningService.approve(await admin(), params.id, body, coach()),
        {
          params: IdParam,
          body: t.Object({
            name: t.Optional(t.String({ maxLength: 200 })),
            group: t.Optional(t.String({ maxLength: 200 })),
            coachName: t.Optional(t.String({ maxLength: 200 })),
          }),
          response: {
            200: t.Object({
              status: t.Union([
                t.Literal("approved"),
                t.Literal("already-in-program"),
              ]),
              leaderId: Nullable(t.String()),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/admin/learning/requests/:id/decline",
        async ({ store: { learningService }, admin, params, body }) =>
          learningService.decline(await admin(), params.id, body.reason ?? ""),
        {
          params: IdParam,
          body: t.Object({ reason: t.Optional(t.String({ maxLength: 500 })) }),
          response: {
            200: t.Object({ status: t.Literal("declined") }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/admin/learning/learners",
        async ({ store: { learningService }, admin, query }) => {
          await admin();
          return learningService.learners(query);
        },
        {
          query: t.Object({
            q: t.Optional(t.String({ maxLength: 200 })),
            limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
            offset: t.Optional(t.Numeric({ minimum: 0 })),
          }),
          response: { 200: LearnersSchema, ...StandardErrorResponses },
        },
      ),
  );

export { LEARNERS_PAGE };
export type CoachLearningPlugin = typeof plugin;
export default plugin;
