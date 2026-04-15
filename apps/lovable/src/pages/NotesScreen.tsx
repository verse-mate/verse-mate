import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { FileText, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Note } from '@/services/types';
import EditNoteSheet from '@/components/EditNoteSheet';
import NoteOptionsSheet from '@/components/NoteOptionsSheet';
import ScreenHeader from '@/components/ScreenHeader';
import { useRightPanel } from '@/contexts/RightPanelContext';

export default function NotesScreen() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const rightPanel = useRightPanel();
  const { book: bookParam, chapter: chapterParam } = useParams<{
    book?: string;
    chapter?: string;
  }>();
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [optionsNote, setOptionsNote] = useState<Note | null>(null);

  // When in right panel, manage sub-navigation with local state instead of URL
  const [localBook, setLocalBook] = useState<string | null>(null);
  const [localChapter, setLocalChapter] = useState<number | null>(null);
  const inRightPanel = !!rightPanel?.isRightPanel;

  const isChapterView = inRightPanel
    ? !!(localBook && localChapter)
    : !!(bookParam && chapterParam);
  const activeBook = inRightPanel
    ? (localBook || '')
    : (bookParam ? decodeURIComponent(bookParam) : '');
  const activeChapter = inRightPanel
    ? (localChapter || 0)
    : (chapterParam ? parseInt(chapterParam, 10) : 0);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { book: string; bookId: number; chapter: number; count: number }
    >();
    for (const n of state.notes) {
      const key = `${n.bookId}:${n.chapter}`;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else
        map.set(key, {
          book: n.book,
          bookId: n.bookId,
          chapter: n.chapter,
          count: 1,
        });
    }
    return Array.from(map.values()).sort((a, b) => a.bookId - b.bookId || a.chapter - b.chapter);
  }, [state.notes]);

  const notesForChapter = useMemo(
    () =>
      state.notes.filter(
        n => n.book === activeBook && n.chapter === activeChapter
      ),
    [state.notes, activeBook, activeChapter]
  );

  const openChapter = (book: string, chapter: number, bookId: number) => {
    if (inRightPanel) {
      // Don't change Bible location — Notes are independent
      setLocalBook(book);
      setLocalChapter(chapter);
    } else {
      dispatch({ type: 'SET_PASSAGE', book, chapter, bookId });
      navigate(`/notes/${encodeURIComponent(book)}/${chapter}`);
    }
  };

  const handleListBack = () => {
    if (inRightPanel) {
      rightPanel.goBack();
    } else {
      navigate('/menu');
    }
  };

  const handleChapterBack = () => {
    if (inRightPanel) {
      setLocalBook(null);
      setLocalChapter(null);
    } else {
      navigate('/notes');
    }
  };

  const listContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 8px',
    borderTop: '1px solid #323232',
    backgroundColor: '#000000',
  };

  const noteItemStyle: React.CSSProperties = {
    background: '#323232',
    border: '1px solid #323232',
    borderRadius: 8,
    padding: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
  };

  if (!isChapterView) {
    return (
      <div className="flex flex-col h-full relative" style={{ backgroundColor: '#1B1B1B' }}>
        <ScreenHeader title="Notes" onBack={handleListBack} />

        <div style={listContainerStyle}>
          {groups.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
              <FileText size={48} style={{ margin: '0 auto 12px', color: 'rgba(255,255,255,0.6)' }} strokeWidth={1.5} />
              <p style={{ fontSize: 14 }}>No notes yet</p>
              <p style={{ fontSize: 12, marginTop: 4, color: 'rgba(255,255,255,0.6)', maxWidth: 240, margin: '4px auto 0' }}>
                Long-press a verse while reading to capture your reflections
              </p>
            </div>
          ) : (
            <>
              {groups.map(g => (
                <button
                  key={`${g.bookId}:${g.chapter}`}
                  onClick={() => openChapter(g.book, g.chapter, g.bookId)}
                  style={noteItemStyle}
                >
                  <FileText size={18} style={{ color: '#E7E7E7', flexShrink: 0 }} strokeWidth={1.75} />
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#E7E7E7', flex: 1 }}>
                    {g.book} {g.chapter}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', background: '#1B1B1B', borderRadius: 4, padding: '2px 8px', minWidth: 28, textAlign: 'center' }}>
                    {g.count}
                  </span>
                  <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: '#1B1B1B' }}>
      <ScreenHeader
        title={`${activeBook} ${activeChapter}`}
        onBack={handleChapterBack}
      />

      <div style={listContainerStyle}>
        {notesForChapter.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', padding: '32px 16px', fontSize: 14, fontStyle: 'italic' }}>No notes here yet.</p>
        ) : (
          <>
            {notesForChapter.map(note => (
              <div key={note.id} style={noteItemStyle}>
                <button
                  onClick={() => setEditingNote(note)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: '8px 12px', borderRadius: 6, minWidth: 0 }}
                >
                  <span style={{ fontSize: 14, color: '#E7E7E7', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {note.text || `${note.book} ${note.chapter}:${note.verse}`}
                  </span>
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setOptionsNote(note);
                  }}
                  aria-label="Note options"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'rgba(255,255,255,0.6)' }}
                >
                  <MoreHorizontal size={18} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {editingNote && (
        <EditNoteSheet note={editingNote} onClose={() => setEditingNote(null)} />
      )}
      {optionsNote && (
        <NoteOptionsSheet
          note={optionsNote}
          onClose={() => setOptionsNote(null)}
          onEdit={() => {
            setEditingNote(optionsNote);
            setOptionsNote(null);
          }}
        />
      )}
    </div>
  );
}
