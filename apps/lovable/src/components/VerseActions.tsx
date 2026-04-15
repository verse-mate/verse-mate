import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { Bookmark, Highlighter, StickyNote, Copy, X, BookOpen, Lightbulb } from 'lucide-react';
import { HighlightColor } from '@/services/types';
import AddNoteSheet from '@/components/AddNoteSheet';

interface Props {
  verse: number;
  onClose: () => void;
}

const HIGHLIGHT_COLORS: { color: HighlightColor; label: string; bgColor: string }[] = [
  { color: 'yellow', label: 'Yellow', bgColor: '#FFD600' },
  { color: 'green', label: 'Green', bgColor: '#4CAF50' },
  { color: 'blue', label: 'Blue', bgColor: '#2196F3' },
  { color: 'pink', label: 'Pink', bgColor: '#E91E63' },
  { color: 'orange', label: 'Orange', bgColor: '#FF9800' },
];

export default function VerseActions({ verse, onClose }: Props) {
  const { state, addBookmark, removeBookmark, addHighlight: ctxAddHighlight, updateHighlight, removeHighlight } = useApp();
  const navigate = useNavigate();
  const [showAddNote, setShowAddNote] = useState(false);

  const isBookmarked = state.bookmarks.some(
    b => b.bookId === state.bookId && b.chapter === state.chapter && b.verse === verse
  );

  const existingHighlight = state.highlights.find(
    h => h.bookId === state.bookId && h.chapter === state.chapter && h.verse === verse
  );

  const toggleBookmark = async () => {
    if (isBookmarked) {
      const bm = state.bookmarks.find(b => b.bookId === state.bookId && b.chapter === state.chapter && b.verse === verse);
      if (bm) await removeBookmark(bm.id);
    } else {
      await addBookmark({
        bookId: state.bookId,
        book: state.book,
        chapter: state.chapter,
        verse,
        version: state.version,
      });
    }
    onClose();
  };

  const addHighlightFn = async (color: HighlightColor) => {
    if (existingHighlight) {
      await updateHighlight(existingHighlight.id, color);
    } else {
      await ctxAddHighlight({
        bookId: state.bookId,
        book: state.book,
        chapter: state.chapter,
        verse,
        startVerse: verse,
        endVerse: verse,
        color,
      });
    }
    onClose();
  };

  const copyVerse = () => {
    const verseText = `${state.book} ${state.chapter}:${verse} (${state.version})`;
    navigator.clipboard.writeText(verseText);
    onClose();
  };

  const viewCommentary = () => {
    navigate(`/read/${encodeURIComponent(state.book)}/${state.chapter}/commentary`);
    onClose();
  };

  const viewInsight = () => {
    navigate(`/read/${encodeURIComponent(state.book)}/${state.chapter}/verse/${verse}/insight`);
    onClose();
  };

  if (showAddNote) {
    return (
      <AddNoteSheet
        book={state.book}
        chapter={state.chapter}
        verse={verse}
        onClose={() => { setShowAddNote(false); onClose(); }}
      />
    );
  }

  return (
    <>
      <div className="absolute inset-0 z-40 bg-foreground/20" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl shadow-lg border-t border-border animate-slide-up">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h3 className="font-semibold text-foreground text-[15px]">
            {state.book} {state.chapter}:{verse}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-3">
          <button onClick={toggleBookmark} className="flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-secondary transition-colors">
            <Bookmark size={20} className={isBookmarked ? 'fill-accent text-accent' : 'text-foreground'} />
            <span className="text-[11px] text-muted-foreground">{isBookmarked ? 'Unbookmark' : 'Bookmark'}</span>
          </button>
          <button onClick={() => setShowAddNote(true)} className="flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-secondary transition-colors">
            <StickyNote size={20} className="text-foreground" />
            <span className="text-[11px] text-muted-foreground">Note</span>
          </button>
          <button onClick={copyVerse} className="flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-secondary transition-colors">
            <Copy size={20} className="text-foreground" />
            <span className="text-[11px] text-muted-foreground">Copy</span>
          </button>
          <button onClick={viewCommentary} className="flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-secondary transition-colors">
            <BookOpen size={20} className="text-foreground" />
            <span className="text-[11px] text-muted-foreground">Commentary</span>
          </button>
          <button onClick={viewInsight} className="flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-secondary transition-colors">
            <Lightbulb size={20} className="text-foreground" />
            <span className="text-[11px] text-muted-foreground">Insight</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2.5 rounded-lg hover:bg-secondary transition-colors">
            <Highlighter size={20} className="text-foreground" />
            <span className="text-[11px] text-muted-foreground">Highlight</span>
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 pb-4 pt-1">
          <span className="text-[11px] text-muted-foreground mr-1">Color:</span>
          {HIGHLIGHT_COLORS.map(c => (
            <button
              key={c.color}
              onClick={() => addHighlightFn(c.color)}
              className={`w-8 h-8 rounded-full border-2 ${
                existingHighlight?.color === c.color ? 'border-accent' : 'border-transparent'
              } transition-all hover:scale-110`}
              style={{ backgroundColor: c.bgColor }}
              title={c.label}
            />
          ))}
          {existingHighlight && (
            <button
              onClick={async () => { await removeHighlight(existingHighlight.id); onClose(); }}
              className="text-[11px] text-destructive ml-auto"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
