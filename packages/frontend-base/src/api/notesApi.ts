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

// Feature flag for notes functionality
const isNotesEnabled = () => {
  // Check environment variable first
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_NOTES_ENABLED !== undefined) {
    return process.env.NEXT_PUBLIC_NOTES_ENABLED === 'true';
  }
  // Default to enabled in development, disabled in production
  return process.env.NODE_ENV === 'development';
};

// Environment-aware API URL
const getApiBaseUrl = () => {
  // Use environment variable if available
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_NOTES_API_URL) {
    return process.env.NEXT_PUBLIC_NOTES_API_URL;
  }
  // Default based on environment
  return process.env.NODE_ENV === 'development' 
    ? 'http://localhost:4000'
    : 'https://api.verse-mate.apegro.dev';
};

const API_BASE_URL = getApiBaseUrl();

// Environment-aware authentication
const getAuthToken = () => {
  if (process.env.NODE_ENV === 'development') {
    // Use mock token in development
    return 'mock-dev-token';
  }
  // TODO: Integrate with real authentication system in production
  // This should get the actual JWT token from your auth provider
  // Example: return getSessionToken() || localStorage.getItem('auth_token');
  throw new Error('Production authentication not implemented. Please integrate with your auth system.');
};

const getUserId = () => {
  if (process.env.NODE_ENV === 'development') {
    // Use mock UUID in development
    return '550e8400-e29b-41d4-a716-446655440000';
  }
  // TODO: Get real user ID from authenticated user context
  // This should get the actual user ID from your auth provider
  // Example: return getCurrentUser()?.id || getSessionUserId();
  throw new Error('Production user ID retrieval not implemented. Please integrate with your auth system.');
};

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getAuthToken()}`,
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
      const response = await apiRequest(`/notes/${bookName}/${chapterNumber}/${translation}?userId=${getUserId()}`);
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
          userId: noteData.userId || getUserId(),
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
          userId: updateData.userId || getUserId(),
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
      const response = await apiRequest(`/notes/${noteId}?userId=${getUserId()}`, {
        method: "DELETE",
      });
      return response.success;
    } catch (error) {
      console.error("[Notes API] Error deleting note:", error);
      return false;
    }
  },
};
