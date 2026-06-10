import { Elysia, t } from "elysia";
import { NotFoundError } from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import {
  CreateDailyVerseDto,
  CreateDailyVerseTagDto,
  UpdateDailyVerseDto,
} from "../daily-verse/dto/daily-verse.dto";
import type { DailyVerseInput } from "../daily-verse/repository/daily-verse.repository";
import {
  AdminDailyVerseEnvelopeSchema,
  AdminDailyVerseHistorySchema,
  AdminDailyVerseListSchema,
  AdminDailyVerseTagEnvelopeSchema,
  AdminDailyVerseTagListSchema,
  AdminDeleteResultSchema,
} from "../daily-verse/schemas/daily-verse-response.schema";

/** Serialize a Date (or already-serialized value) to an ISO string or null. */
function serializeDate(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/** Serialize the timestamp fields of a curated-verse row. */
function serializeVerse<
  T extends {
    created_at: Date | string | null;
    updated_at: Date | string | null;
  },
>(verse: T) {
  return {
    ...verse,
    created_at: serializeDate(verse.created_at),
    updated_at: serializeDate(verse.updated_at),
  };
}

/** Serialize the timestamp fields of a tag row. */
function serializeTag<
  T extends {
    created_at: Date | string | null;
    updated_at: Date | string | null;
  },
>(tag: T) {
  return {
    ...tag,
    created_at: serializeDate(tag.created_at),
    updated_at: serializeDate(tag.updated_at),
  };
}

/**
 * Admin CRUD for the curation pool + tag vocabulary. Like adminTopicPlugin,
 * this is a context-inheriting sub-plugin: it is `.use()`d inside the admin
 * plugin's `/admin` group, so it inherits the store (including
 * `dailyVerseService`) and the authGuard + adminGuard already applied there.
 *
 * Write paths invalidate today's pick cache AFTER the DB write commits
 * (D-26 / D-39 post-commit hook) so a curator's mid-day change is reflected
 * on the next request; a failed invalidation self-heals at the 24h TTL.
 *
 * All Date fields (created_at / updated_at / pick_date) are serialized to ISO
 * strings before returning, per the date-serialization standard, matching the
 * `t.String()` shapes declared in the response schemas.
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
          const { items, total } = await store.dailyVerseService.list({
            tagSlug: query.tag,
            activeOnly,
            limit,
            offset,
          });
          return { items: items.map(serializeVerse), total };
        },
        {
          query: t.Object({
            tag: t.Optional(t.String()),
            active: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          }),
          response: {
            200: AdminDailyVerseListSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/history",
        async ({ query, store }: any) => {
          const limit = query.limit ? Number(query.limit) : 50;
          const offset = query.offset ? Number(query.offset) : 0;
          const history = await store.dailyVerseService.listHistory({
            limit,
            offset,
          });
          return {
            history: history.map((h: any) => ({
              ...h,
              pick_date: serializeDate(h.pick_date),
            })),
          };
        },
        {
          query: t.Object({
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          }),
          response: {
            200: AdminDailyVerseHistorySchema,
            ...StandardErrorResponses,
          },
        },
      )
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
          return { verse: serializeVerse(verse) };
        },
        {
          body: CreateDailyVerseDto,
          response: {
            200: AdminDailyVerseEnvelopeSchema,
            ...StandardErrorResponses,
          },
        },
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
          return { verse: serializeVerse(verse) };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: UpdateDailyVerseDto,
          response: {
            200: AdminDailyVerseEnvelopeSchema,
            ...StandardErrorResponses,
          },
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
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          response: {
            200: AdminDeleteResultSchema,
            ...StandardErrorResponses,
          },
        },
      ),
  )
  .group("/daily-verse-tags", (app) =>
    app
      .get(
        "/",
        async ({ query, store }: any) => {
          const activeOnly = query.active === "true";
          const tags = await store.dailyVerseService.listTags(activeOnly);
          return { tags: tags.map(serializeTag) };
        },
        {
          query: t.Object({ active: t.Optional(t.String()) }),
          response: {
            200: AdminDailyVerseTagListSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/",
        async ({ body, store }: any) => {
          const tag = await store.dailyVerseService.createTag(body);
          return { tag: serializeTag(tag) };
        },
        {
          body: CreateDailyVerseTagDto,
          response: {
            200: AdminDailyVerseTagEnvelopeSchema,
            ...StandardErrorResponses,
          },
        },
      ),
  );

export default adminDailyVersePlugin;
