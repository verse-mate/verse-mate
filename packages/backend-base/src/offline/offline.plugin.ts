import { Elysia, t } from "elysia";
import { createErrorHandler } from "../common/error-handler";
import { NotFoundError } from "../common/errors";
import shared from "../shared/shared.plugin";
import { OfflineRepository } from "./offline.repository";
import { OfflineService } from "./offline.service";
import { OfflineManifestSchema } from "./schemas/offline-response.schema";

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("offline plugin"))
  .state((state) => {
    const offlineRepository = new OfflineRepository(state.db);
    return {
      ...state,
      offlineService: new OfflineService(offlineRepository, state.cache),
    };
  })
  .group("/offline", (app) =>
    app
      // GET /offline/manifest - Get available content and update timestamps
      .get(
        "/manifest",
        async ({ store: { offlineService } }) => {
          const manifest = await offlineService.getManifest();
          return manifest;
        },
        {
          response: {
            200: OfflineManifestSchema,
          },
          detail: {
            tags: ["Offline"],
            summary: "Get offline content manifest",
            description:
              "Returns available Bible versions, commentary languages, and topic languages with their last update timestamps and estimated sizes.",
          },
        },
      )

      // GET /offline/bible/:versionKey - Download full Bible version
      .get(
        "/bible/:versionKey",
        async ({ params, headers, store: { offlineService }, set }) => {
          const { versionKey } = params;

          // Check if version exists
          const exists = await offlineService.bibleVersionExists(versionKey);
          if (!exists) {
            throw new NotFoundError(`Bible version '${versionKey}' not found`);
          }

          // Check If-Modified-Since header
          const ifModifiedSince = headers["if-modified-since"];
          if (ifModifiedSince) {
            const lastModified =
              await offlineService.getBibleVersionLastModified(versionKey);
            if (lastModified) {
              const clientDate = new Date(ifModifiedSince);
              if (lastModified <= clientDate) {
                set.status = 304;
                return null;
              }
            }
          }

          // Get compressed data
          const data = await offlineService.getBibleVersionData(versionKey);

          // Set response headers
          set.headers["Content-Type"] = "application/json";
          set.headers["Content-Encoding"] = "gzip";
          set.headers["Cache-Control"] = "public, max-age=86400"; // 24 hours

          const lastModified =
            await offlineService.getBibleVersionLastModified(versionKey);
          if (lastModified) {
            set.headers["Last-Modified"] = lastModified.toUTCString();
          }

          return new Response(data, {
            headers: set.headers as HeadersInit,
          });
        },
        {
          params: t.Object({
            versionKey: t.String(),
          }),
          detail: {
            tags: ["Offline"],
            summary: "Download Bible version data",
            description:
              "Returns all verses for a specific Bible version as gzip-compressed JSON. Supports If-Modified-Since header for conditional requests.",
          },
        },
      )

      // GET /offline/commentaries/:languageCode - Download all commentaries for a language
      .get(
        "/commentaries/:languageCode",
        async ({ params, headers, store: { offlineService }, set }) => {
          const { languageCode } = params;

          // Check if commentaries exist for this language
          const exists = await offlineService.commentaryExists(languageCode);
          if (!exists) {
            throw new NotFoundError(
              `No commentaries found for language '${languageCode}'`,
            );
          }

          // Check If-Modified-Since header
          const ifModifiedSince = headers["if-modified-since"];
          if (ifModifiedSince) {
            const lastModified =
              await offlineService.getCommentaryLastModified(languageCode);
            if (lastModified) {
              const clientDate = new Date(ifModifiedSince);
              if (lastModified <= clientDate) {
                set.status = 304;
                return null;
              }
            }
          }

          // Get compressed data
          const data = await offlineService.getCommentaryData(languageCode);

          // Set response headers
          set.headers["Content-Type"] = "application/json";
          set.headers["Content-Encoding"] = "gzip";
          set.headers["Cache-Control"] = "public, max-age=86400"; // 24 hours

          const lastModified =
            await offlineService.getCommentaryLastModified(languageCode);
          if (lastModified) {
            set.headers["Last-Modified"] = lastModified.toUTCString();
          }

          return new Response(data, {
            headers: set.headers as HeadersInit,
          });
        },
        {
          params: t.Object({
            languageCode: t.String(),
          }),
          detail: {
            tags: ["Offline"],
            summary: "Download commentaries for a language",
            description:
              "Returns all active explanations/commentaries for a specific language as gzip-compressed JSON. Supports If-Modified-Since header for conditional requests.",
          },
        },
      )

      // GET /offline/topics/:languageCode - Download all topics for a language
      .get(
        "/topics/:languageCode",
        async ({ params, headers, store: { offlineService }, set }) => {
          const { languageCode } = params;

          // Check if topics exist for this language
          const exists = await offlineService.topicsExist(languageCode);
          if (!exists) {
            throw new NotFoundError(
              `No topics found for language '${languageCode}'`,
            );
          }

          // Check If-Modified-Since header
          const ifModifiedSince = headers["if-modified-since"];
          if (ifModifiedSince) {
            const lastModified =
              await offlineService.getTopicsLastModified(languageCode);
            if (lastModified) {
              const clientDate = new Date(ifModifiedSince);
              if (lastModified <= clientDate) {
                set.status = 304;
                return null;
              }
            }
          }

          // Get compressed data
          const data = await offlineService.getTopicsData(languageCode);

          // Set response headers
          set.headers["Content-Type"] = "application/json";
          set.headers["Content-Encoding"] = "gzip";
          set.headers["Cache-Control"] = "public, max-age=86400"; // 24 hours

          const lastModified =
            await offlineService.getTopicsLastModified(languageCode);
          if (lastModified) {
            set.headers["Last-Modified"] = lastModified.toUTCString();
          }

          return new Response(data, {
            headers: set.headers as HeadersInit,
          });
        },
        {
          params: t.Object({
            languageCode: t.String(),
          }),
          detail: {
            tags: ["Offline"],
            summary: "Download topics for a language",
            description:
              "Returns all topics and their references for a specific language as gzip-compressed JSON. Supports If-Modified-Since header for conditional requests.",
          },
        },
      ),
  );

export type OfflinePlugin = typeof plugin;

export default plugin;
