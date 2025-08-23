import bearer from "@elysiajs/bearer";
import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import shared from "../shared/shared.plugin";
import { NotesService } from "./notes.service";

const plugin = new Elysia({ prefix: "/notes" })
  .use(shared)
  .use(bearer())
  .resolve({ as: "scoped" }, authDerive)
  .state((state) => {
    console.log(
      "[Notes Plugin] Initializing NotesService with real database connection...",
    );
    return {
      ...state,
      notesService: new NotesService(state.db),
    };
  })
  .get(
    "/:bookName/:chapterNumber",
    async ({ params, store, set, currentUserId }) => {
      console.log("[Notes Plugin] GET notes request:", {
        params,
        currentUserId,
      });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        const notes = await notesService.getNotesByChapter(
          currentUserId,
          params.bookName,
          Number.parseInt(params.chapterNumber),
        );

        console.log("[Notes Plugin] Retrieved notes:", notes.length);
        return { notes };
      } catch (error) {
        console.error("[Notes Plugin] Error fetching notes:", error);
        set.status = 500;
        return { error: "Failed to fetch notes" };
      }
    },
    {
      params: t.Object({
        bookName: t.String(),
        chapterNumber: t.String(),
      }),
    },
  )
  .post(
    "/",
    async ({ body, store, set, currentUserId }) => {
      console.log("[Notes Plugin] POST note request:", { body, currentUserId });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        // Get chapter_id from book name and chapter number
        const chapterId = await notesService.getChapterId(
          body.bookName,
          body.chapterNumber,
        );
        if (!chapterId) {
          set.status = 400;
          return { error: "Invalid book or chapter" };
        }

        const note = await notesService.createNote({
          user_id: currentUserId,
          chapter_id: chapterId,
          content: body.content,
        });

        console.log("[Notes Plugin] Created note:", note.note_id);
        return { note };
      } catch (error) {
        console.error("[Notes Plugin] Error creating note:", error);
        set.status = 500;
        return { error: "Failed to create note" };
      }
    },
    {
      body: t.Object({
        bookName: t.String(),
        chapterNumber: t.Number(),
        content: t.String(),
      }),
    },
  )
  .put(
    "/:noteId",
    async ({ params, body, store, set, currentUserId }) => {
      console.log("[Notes Plugin] PUT note request:", {
        params,
        body,
        currentUserId,
      });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        const note = await notesService.updateNote(
          params.noteId,
          currentUserId,
          {
            content: body.content,
          },
        );

        if (!note) {
          set.status = 404;
          return { error: "Note not found" };
        }

        console.log("[Notes Plugin] Updated note:", note.note_id);
        return { note };
      } catch (error) {
        console.error("[Notes Plugin] Error updating note:", error);
        set.status = 500;
        return { error: "Failed to update note" };
      }
    },
    {
      params: t.Object({
        noteId: t.String(),
      }),
      body: t.Object({
        content: t.String(),
      }),
    },
  )
  .delete(
    "/:noteId",
    async ({ params, store, set, currentUserId }) => {
      console.log("[Notes Plugin] DELETE note request:", {
        params,
        currentUserId,
      });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        const success = await notesService.deleteNote(
          params.noteId,
          currentUserId,
        );

        if (!success) {
          set.status = 404;
          return { error: "Note not found" };
        }

        console.log("[Notes Plugin] Deleted note:", params.noteId);
        return { success: true };
      } catch (error) {
        console.error("[Notes Plugin] Error deleting note:", error);
        set.status = 500;
        return { error: "Failed to delete note" };
      }
    },
    {
      params: t.Object({
        noteId: t.String(),
      }),
    },
  );

export type NotesPlugin = typeof plugin;

export default plugin;
export { plugin as notesPlugin };
