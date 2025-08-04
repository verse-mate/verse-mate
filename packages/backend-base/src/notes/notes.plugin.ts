import { Elysia, t } from "elysia";
import shared from "../shared/shared.plugin";
import { NotesService } from "./notes.service";

const plugin = new Elysia({ prefix: "/notes" })
  .use(shared)
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
    async ({ params, query, store, set }) => {
      console.log("[Notes Plugin] GET notes request:", { params, query });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        // Extract user ID from query or use proper UUID for development
        const userId = query.userId || "550e8400-e29b-41d4-a716-446655440000";

        const notes = await notesService.getNotesByChapter(
          userId,
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
      query: t.Object({
        userId: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ body, store, set }) => {
      console.log("[Notes Plugin] POST note request:", body);

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        const note = await notesService.createNote({
          user_id: body.userId || "mock-user-id",
          book_name: body.bookName,
          chapter_number: body.chapterNumber,
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
        userId: t.Optional(t.String()),
        bookName: t.String(),
        chapterNumber: t.Number(),
        content: t.String(),
      }),
    },
  )
  .put(
    "/:noteId",
    async ({ params, body, store, set }) => {
      console.log("[Notes Plugin] PUT note request:", { params, body });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        const userId = body.userId || "550e8400-e29b-41d4-a716-446655440000";
        const note = await notesService.updateNote(params.noteId, userId, {
          content: body.content,
        });

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
        userId: t.Optional(t.String()),
        content: t.String(),
      }),
    },
  )
  .delete(
    "/:noteId",
    async ({ params, query, store, set }) => {
      console.log("[Notes Plugin] DELETE note request:", { params, query });

      const { notesService } = store as any;
      if (!notesService) {
        set.status = 500;
        return { error: "Notes service not initialized" };
      }

      try {
        const userId = query.userId || "550e8400-e29b-41d4-a716-446655440000";
        const success = await notesService.deleteNote(params.noteId, userId);

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
      query: t.Object({
        userId: t.Optional(t.String()),
      }),
    },
  );

export type NotesPlugin = typeof plugin;

export default plugin;
export { plugin as notesPlugin };
