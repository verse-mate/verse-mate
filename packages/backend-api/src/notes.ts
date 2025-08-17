import { $env } from "frontend-envs";

export type Note = {
  note_id: string;
  user_id: string;
  book_name: string;
  chapter_number: number;
  content: string;
  created_at: string;
  updated_at: string;
};

const base = () => $env.get().apiUrl.replace(/\/$/, "");

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
};

export const notes = {
  async list(bookName: string, chapterNumber: number, userId: string) {
    const url = new URL(
      `${base()}/notes/${encodeURIComponent(bookName)}/${chapterNumber}`,
    );
    url.searchParams.set("userId", userId);
    const res = await fetch(url.toString());
    return json<{ notes: Note[] }>(res);
  },

  async create(params: {
    bookName: string;
    chapterNumber: number;
    content: string;
    userId: string;
  }) {
    const res = await fetch(`${base()}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return json<{ note: Note }>(res);
  },

  async update(noteId: string, params: { content: string; userId: string }) {
    const res = await fetch(`${base()}/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return json<{ note: Note }>(res);
  },

  async remove(noteId: string, userId: string) {
    const url = new URL(`${base()}/notes/${noteId}`);
    url.searchParams.set("userId", userId);
    const res = await fetch(url.toString(), { method: "DELETE" });
    return json<{ success: boolean }>(res);
  },
};
