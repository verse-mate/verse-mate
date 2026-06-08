import { Elysia, t } from "elysia";
import { NotFoundError } from "../common/errors";
import {
  CreateDailyVerseDto,
  CreateDailyVerseTagDto,
  UpdateDailyVerseDto,
} from "../daily-verse/dto/daily-verse.dto";
import type { DailyVerseInput } from "../daily-verse/repository/daily-verse.repository";

/**
 * Admin CRUD for the curation pool + tag vocabulary. Like adminTopicPlugin,
 * this is a context-inheriting sub-plugin: it is `.use()`d inside the admin
 * plugin's `/admin` group, so it inherits the store (including
 * `dailyVerseService`) and the authGuard + adminGuard already applied there.
 *
 * Write paths invalidate today's pick cache AFTER the DB write commits
 * (D-26 / D-39 post-commit hook) so a curator's mid-day change is reflected
 * on the next request; a failed invalidation self-heals at the 24h TTL.
 */
const adminDailyVersePlugin = new Elysia()
  .group("/daily-verses", (app) =>
    app
      .get(
        "/",
        async ({ query, store }: any) => {
          const limit = query.limit ? Number(query.limit) : 50;
          const offset = query.offset ? Number(query.offset) : 0;
          const activeOnly = query.active === "true";
          return store.dailyVerseService.list({
            tagSlug: query.tag,
            activeOnly,
            limit,
            offset,
          });
        },
        {
          query: t.Object({
            tag: t.Optional(t.String()),
            active: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          }),
        },
      )
      .get("/history", async ({ query, store }: any) => {
        const limit = query.limit ? Number(query.limit) : 50;
        const offset = query.offset ? Number(query.offset) : 0;
        const history = await store.dailyVerseService.listHistory({
          limit,
          offset,
        });
        return { history };
      })
      .post(
        "/",
        async ({ body, store }: any) => {
          const input: DailyVerseInput = {
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            verse_start: body.verse_start,
            verse_end: body.verse_end ?? null,
            note: body.note ?? null,
            is_active: body.is_active,
            tag_ids: body.tag_ids ?? [],
          };
          const verse = await store.dailyVerseService.createCurated(input);
          await store.dailyVerseService.invalidatePickForToday();
          return { verse };
        },
        { body: CreateDailyVerseDto },
      )
      .put(
        "/:id",
        async ({ params, body, store }: any) => {
          const verse = await store.dailyVerseService.updateCurated(params.id, {
            ...body,
            tag_ids: body.tag_ids,
          });
          if (!verse)
            throw new NotFoundError(`Daily verse ${params.id} not found`);
          await store.dailyVerseService.invalidatePickForToday();
          return { verse };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: UpdateDailyVerseDto,
        },
      )
      .delete(
        "/:id",
        async ({ params, store }: any) => {
          const ok = await store.dailyVerseService.deleteCurated(params.id);
          if (!ok)
            throw new NotFoundError(`Daily verse ${params.id} not found`);
          await store.dailyVerseService.invalidatePickForToday();
          return { success: true };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  )
  .group("/daily-verse-tags", (app) =>
    app
      .get("/", async ({ query, store }: any) => {
        const activeOnly = query.active === "true";
        const tags = await store.dailyVerseService.listTags(activeOnly);
        return { tags };
      })
      .post(
        "/",
        async ({ body, store }: any) => {
          const tag = await store.dailyVerseService.createTag(body);
          return { tag };
        },
        { body: CreateDailyVerseTagDto },
      ),
  );

export default adminDailyVersePlugin;
