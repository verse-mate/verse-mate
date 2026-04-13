import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { X } from 'lucide-react';

interface Props {
  book: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}

export default function AddNoteSheet({ book, chapter, verse, onClose }: Props) {
  const { state, addNote } = useApp();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const maxChars = 500;

  const handleSave = async () => {
    if (text.length < 10) return;
    setSaving(true);
    try {
      await addNote({
        bookId: state.bookId,
        book,
        chapter,
        verse,
        text,
      });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 bg-dark-surface rounded-t-[24px] border-t border-dark safe-bottom animate-slide-up">
        <div className="flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-dark-muted/40" />
        </div>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-[16px] font-semibold text-dark-fg">Add Note</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center">
            <X size={18} className="text-dark-fg" />
          </button>
        </div>
        <div className="px-4 pb-5 space-y-3">
          <p className="text-[13px] text-dark-muted">
            {book} {chapter}:{verse}
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, maxChars))}
            placeholder="Write your note here (minimum 10 characters)..."
            rows={5}
            className="w-full rounded-2xl bg-dark-raised border border-dark px-4 py-3 text-[14px] text-dark-fg placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))] resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-dark-muted">
              {text.length}/{maxChars}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 h-10 rounded-xl bg-dark-raised border border-dark text-dark-fg text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={text.length < 10 || saving}
                className="px-4 h-10 rounded-xl bg-gold text-[#1A1A1A] text-[13px] font-medium disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
