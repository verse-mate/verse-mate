// AppContext — single source of truth for VerseMate app state.
// User data (bookmarks / notes / highlights) is fetched from the real API
// when the user is signed in; settings stay local-only.
import React, { createContext, useContext, useReducer, useEffect, ReactNode, useCallback } from 'react';
import { BibleVersion, Bookmark, Note, Highlight, HighlightColor } from '@/services/types';
import {
  loadSettings,
  saveSettings,
  AppSettings,
  isSignedIn as hasToken,
  fetchCurrentUser,
  fetchBookmarks as apiFetchBookmarks,
  fetchNotes as apiFetchNotes,
  fetchHighlights as apiFetchHighlights,
  addBookmark as apiAddBookmark,
  removeBookmark as apiRemoveBookmark,
  addNote as apiAddNote,
  updateNote as apiUpdateNote,
  removeNote as apiRemoveNote,
  addHighlight as apiAddHighlight,
  updateHighlight as apiUpdateHighlight,
  removeHighlight as apiRemoveHighlight,
  fetchBooks as apiFetchBooks,
  resolveBookId,
  logout as apiLogout,
} from '@/services/bibleService';

interface AppState {
  book: string;
  bookId: number;
  chapter: number;
  selectedVerse: number | null;
  version: BibleVersion;
  bookmarks: Bookmark[];
  notes: Note[];
  highlights: Highlight[];
  settings: AppSettings;
  isSignedIn: boolean;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userAvatarUrl: string | null;
}

type Action =
  | { type: 'SET_PASSAGE'; book: string; chapter: number; bookId?: number }
  | { type: 'SET_VERSE'; verse: number | null }
  | { type: 'SET_VERSION'; version: BibleVersion }
  | { type: 'SET_BOOKMARKS'; bookmarks: Bookmark[] }
  | { type: 'ADD_BOOKMARK'; bookmark: Bookmark }
  | { type: 'REMOVE_BOOKMARK'; id: string }
  | { type: 'SET_NOTES'; notes: Note[] }
  | { type: 'ADD_NOTE'; note: Note }
  | { type: 'UPDATE_NOTE'; id: string; text: string }
  | { type: 'REMOVE_NOTE'; id: string }
  | { type: 'SET_HIGHLIGHTS'; highlights: Highlight[] }
  | { type: 'ADD_HIGHLIGHT'; highlight: Highlight }
  | { type: 'UPDATE_HIGHLIGHT'; id: string; color: HighlightColor }
  | { type: 'REMOVE_HIGHLIGHT'; id: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<AppSettings> }
  | {
      type: 'SET_SIGNED_IN';
      value: boolean;
      userId?: string | null;
      userName?: string | null;
      userEmail?: string | null;
      userAvatarUrl?: string | null;
    };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PASSAGE':
      return {
        ...state,
        book: action.book,
        chapter: action.chapter,
        bookId: action.bookId ?? state.bookId,
        selectedVerse: null,
      };
    case 'SET_VERSE':
      return { ...state, selectedVerse: action.verse };
    case 'SET_VERSION':
      return { ...state, version: action.version };
    case 'SET_BOOKMARKS':
      return { ...state, bookmarks: action.bookmarks };
    case 'ADD_BOOKMARK':
      return { ...state, bookmarks: [...state.bookmarks, action.bookmark] };
    case 'REMOVE_BOOKMARK':
      return { ...state, bookmarks: state.bookmarks.filter(b => b.id !== action.id) };
    case 'SET_NOTES':
      return { ...state, notes: action.notes };
    case 'ADD_NOTE':
      return { ...state, notes: [...state.notes, action.note] };
    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.id ? { ...n, text: action.text, updatedAt: new Date().toISOString() } : n
        ),
      };
    case 'REMOVE_NOTE':
      return { ...state, notes: state.notes.filter(n => n.id !== action.id) };
    case 'SET_HIGHLIGHTS':
      return { ...state, highlights: action.highlights };
    case 'ADD_HIGHLIGHT':
      return { ...state, highlights: [...state.highlights, action.highlight] };
    case 'UPDATE_HIGHLIGHT':
      return {
        ...state,
        highlights: state.highlights.map(h =>
          h.id === action.id ? { ...h, color: action.color } : h
        ),
      };
    case 'REMOVE_HIGHLIGHT':
      return { ...state, highlights: state.highlights.filter(h => h.id !== action.id) };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'SET_SIGNED_IN':
      return {
        ...state,
        isSignedIn: action.value,
        userId: action.userId !== undefined ? action.userId : state.userId,
        userName: action.userName !== undefined ? action.userName : state.userName,
        userEmail: action.userEmail !== undefined ? action.userEmail : state.userEmail,
        userAvatarUrl:
          action.userAvatarUrl !== undefined ? action.userAvatarUrl : state.userAvatarUrl,
      };
    default:
      return state;
  }
}

const initialSettings = loadSettings();

const initialState: AppState = {
  book: 'Genesis',
  bookId: 1,
  chapter: 1,
  selectedVerse: null,
  version: initialSettings.defaultVersion,
  bookmarks: [],
  notes: [],
  highlights: [],
  settings: initialSettings,
  isSignedIn: hasToken(),
  userId: null,
  userName: null,
  userEmail: null,
  userAvatarUrl: null,
};

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  // Higher-level mutations that also write through to the API
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateNote: (id: string, text: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  addHighlight: (h: Omit<Highlight, 'id' | 'createdAt'>) => Promise<void>;
  updateHighlight: (id: string, color: HighlightColor) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Warm the books cache on mount
  useEffect(() => {
    apiFetchBooks().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the current book name changes, make sure bookId stays in sync.
  // This lets screens dispatch SET_PASSAGE with just a book name + chapter
  // and the ID gets resolved automatically.
  useEffect(() => {
    (async () => {
      const id = await resolveBookId(state.book);
      if (id && id !== state.bookId) {
        dispatch({ type: 'SET_PASSAGE', book: state.book, chapter: state.chapter, bookId: id });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.book]);

  // Persist settings
  useEffect(() => {
    saveSettings(state.settings);
  }, [state.settings]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [state.settings.theme]);

  // When signed in, fetch the current user + user data
  useEffect(() => {
    if (!state.isSignedIn) {
      dispatch({ type: 'SET_BOOKMARKS', bookmarks: [] });
      dispatch({ type: 'SET_NOTES', notes: [] });
      dispatch({ type: 'SET_HIGHLIGHTS', highlights: [] });
      return;
    }
    (async () => {
      try {
        const user = await fetchCurrentUser();
        dispatch({
          type: 'SET_SIGNED_IN',
          value: true,
          userId: user.id,
          userName: user.name || null,
          userEmail: user.email || null,
          userAvatarUrl: user.avatarUrl || null,
        });
        const [bookmarks, notes, highlights] = await Promise.all([
          apiFetchBookmarks(user.id),
          apiFetchNotes(user.id),
          apiFetchHighlights(user.id),
        ]);
        dispatch({ type: 'SET_BOOKMARKS', bookmarks });
        dispatch({ type: 'SET_NOTES', notes });
        dispatch({ type: 'SET_HIGHLIGHTS', highlights });
      } catch {
        // Token probably invalid — treat as signed out
        dispatch({
      type: 'SET_SIGNED_IN',
      value: false,
      userId: null,
      userName: null,
      userEmail: null,
      userAvatarUrl: null,
    });
      }
    })();
  }, [state.isSignedIn]);

  // ─── API-backed mutations ────────────────────────────────────────────
  const addBookmark = useCallback(
    async (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => {
      const optimistic: Bookmark = {
        ...bookmark,
        id: `tmp-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_BOOKMARK', bookmark: optimistic });
      if (!state.userId) return;
      try {
        await apiAddBookmark({
          userId: state.userId,
          bookId: bookmark.bookId,
          chapter: bookmark.chapter,
        });
        const refreshed = await apiFetchBookmarks(state.userId);
        dispatch({ type: 'SET_BOOKMARKS', bookmarks: refreshed });
      } catch {
        dispatch({ type: 'REMOVE_BOOKMARK', id: optimistic.id });
      }
    },
    [state.userId]
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      const existing = state.bookmarks.find(b => b.id === id);
      if (!existing) return;
      dispatch({ type: 'REMOVE_BOOKMARK', id });
      if (!state.userId) return;
      try {
        await apiRemoveBookmark({
          userId: state.userId,
          bookId: existing.bookId,
          chapter: existing.chapter,
        });
        // Refetch to reconcile any state the server changed
        const refreshed = await apiFetchBookmarks(state.userId);
        dispatch({ type: 'SET_BOOKMARKS', bookmarks: refreshed });
      } catch {
        if (existing) dispatch({ type: 'ADD_BOOKMARK', bookmark: existing });
      }
    },
    [state.bookmarks, state.userId]
  );

  const addNote = useCallback(
    async (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const optimistic: Note = { ...note, id: `tmp-${Date.now()}`, createdAt: now, updatedAt: now };
      dispatch({ type: 'ADD_NOTE', note: optimistic });
      try {
        await apiAddNote({ bookId: note.bookId, chapter: note.chapter, verse: note.verse, text: note.text });
        if (state.userId) {
          const refreshed = await apiFetchNotes(state.userId);
          dispatch({ type: 'SET_NOTES', notes: refreshed });
        }
      } catch {
        dispatch({ type: 'REMOVE_NOTE', id: optimistic.id });
      }
    },
    [state.userId]
  );

  const updateNote = useCallback(async (id: string, text: string) => {
    dispatch({ type: 'UPDATE_NOTE', id, text });
    try {
      await apiUpdateNote(id, text);
    } catch {
      /* keep optimistic */
    }
  }, []);

  const removeNote = useCallback(
    async (id: string) => {
      const existing = state.notes.find(n => n.id === id);
      dispatch({ type: 'REMOVE_NOTE', id });
      try {
        await apiRemoveNote(id);
      } catch {
        if (existing) dispatch({ type: 'ADD_NOTE', note: existing });
      }
    },
    [state.notes]
  );

  const addHighlight = useCallback(
    async (h: Omit<Highlight, 'id' | 'createdAt'>) => {
      const optimistic: Highlight = {
        ...h,
        id: `tmp-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_HIGHLIGHT', highlight: optimistic });
      try {
        await apiAddHighlight({
          bookId: h.bookId,
          chapter: h.chapter,
          startVerse: h.startVerse ?? h.verse,
          endVerse: h.endVerse ?? h.verse,
          color: h.color,
        });
        if (state.userId) {
          const refreshed = await apiFetchHighlights(state.userId);
          dispatch({ type: 'SET_HIGHLIGHTS', highlights: refreshed });
        }
      } catch {
        dispatch({ type: 'REMOVE_HIGHLIGHT', id: optimistic.id });
      }
    },
    [state.userId]
  );

  const updateHighlight = useCallback(async (id: string, color: HighlightColor) => {
    dispatch({ type: 'UPDATE_HIGHLIGHT', id, color });
    try {
      await apiUpdateHighlight(id, color);
    } catch {
      /* keep optimistic */
    }
  }, []);

  const removeHighlight = useCallback(
    async (id: string) => {
      const existing = state.highlights.find(h => h.id === id);
      dispatch({ type: 'REMOVE_HIGHLIGHT', id });
      try {
        await apiRemoveHighlight(id);
      } catch {
        if (existing) dispatch({ type: 'ADD_HIGHLIGHT', highlight: existing });
      }
    },
    [state.highlights]
  );

  const signOut = useCallback(async () => {
    await apiLogout();
    dispatch({
      type: 'SET_SIGNED_IN',
      value: false,
      userId: null,
      userName: null,
      userEmail: null,
      userAvatarUrl: null,
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        addBookmark,
        removeBookmark,
        addNote,
        updateNote,
        removeNote,
        addHighlight,
        updateHighlight,
        removeHighlight,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
