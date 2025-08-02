// Notes API helper for frontend
export interface Note {
  note_id: string;
  user_id: string;
  book_name: string;
  chapter_number: number;
  translation: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteRequest {
  userId?: string;
  bookName: string;
  chapterNumber: number;
  translation: string;
  content: string;
}

export interface UpdateNoteRequest {
  userId?: string;
  content: string;
}

const API_BASE_URL = "http://localhost:4000";

// Mock token for development
const getMockToken = () => "mock-dev-token";

// Mock UUID for development
const getMockUserId = () => "550e8400-e29b-41d4-a716-446655440000";

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getMockToken()}`,
    ...options.headers,
  };

  console.log("[Notes API] Request:", { url, method: options.method || "GET" });

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    console.error(
      "[Notes API] Error response:",
      response.status,
      response.statusText,
    );
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  console.log("[Notes API] Response:", data);
  return data;
};

export const notesApi = {
  async getNotes(
    bookName: string,
    chapterNumber: number,
    translation: string,
  ): Promise<Note[]> {
    try {
      const response = await apiRequest(
        `/notes/${bookName}/${chapterNumber}/${translation}?userId=${getMockUserId()}`,
      );
      return response.notes || [];
    } catch (error) {
      console.error("[Notes API] Error fetching notes:", error);
      return [];
    }
  },

  async createNote(noteData: CreateNoteRequest): Promise<Note> {
    try {
      const response = await apiRequest("/notes", {
        method: "POST",
        body: JSON.stringify({
          ...noteData,
          userId: noteData.userId || getMockUserId(),
        }),
      });
      return response.note;
    } catch (error) {
      console.error("[Notes API] Error creating note:", error);
      throw error;
    }
  },

  async updateNote(
    noteId: string,
    updateData: UpdateNoteRequest,
  ): Promise<Note> {
    try {
      const response = await apiRequest(`/notes/${noteId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...updateData,
          userId: updateData.userId || getMockUserId(),
        }),
      });
      return response.note;
    } catch (error) {
      console.error("[Notes API] Error updating note:", error);
      throw error;
    }
  },

  async deleteNote(noteId: string): Promise<boolean> {
    try {
      const response = await apiRequest(
        `/notes/${noteId}?userId=${getMockUserId()}`,
        {
          method: "DELETE",
        },
      );
      return response.success;
    } catch (error) {
      console.error("[Notes API] Error deleting note:", error);
      return false;
    }
  },
};
