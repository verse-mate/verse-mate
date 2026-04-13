import { useState, useEffect, useCallback } from 'react';
import { Copy, Bookmark, Check } from 'lucide-react';
import ShareIcon from '@/components/ShareIcon';
import { useApp } from '@/contexts/AppContext';
import { HighlightColor } from '@/services/types';

const HIGHLIGHT_COLORS: { color: HighlightColor; hex: string }[] = [
  { color: 'yellow', hex: '#FFEB3B' },
  { color: 'green', hex: '#4CAF50' },
  { color: 'blue', hex: '#2196F3' },
  { color: 'pink', hex: '#E91E63' },
  { color: 'purple', hex: '#9C27B0' },
  { color: 'orange', hex: '#FF9800' },
  { color: 'red', hex: '#F44336' },
  { color: 'teal', hex: '#009688' },
];

interface Props {
  book: string;
  chapter: number;
  bookId: number;
}

/**
 * SelectionToolbar — floating toolbar that appears above selected text on desktop.
 * Shows highlight color dots, copy, share, and bookmark actions.
 */
export default function SelectionToolbar({ book, chapter, bookId }: Props) {
  const { state, addHighlight, addBookmark } = useApp();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setPosition(null);
      return;
    }

    const text = sel.toString().trim();
    setSelectedText(text);

    // Find which verses are in the selection by looking at sup elements
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parent = container instanceof Element ? container : container.parentElement;
    if (!parent) return;

    // Walk up to find the font-scripture container
    const scriptureContainer = parent.closest('.font-scripture');
    if (!scriptureContainer) {
      setPosition(null);
      return;
    }

    // Find verse numbers from sup elements in selection range
    const verses: number[] = [];
    const allSups = scriptureContainer.querySelectorAll('sup');
    for (const sup of allSups) {
      if (sel.containsNode(sup, true)) {
        const num = parseInt(sup.textContent || '', 10);
        if (!isNaN(num)) verses.push(num);
      }
    }
    // If no sups found in selection, try to find the nearest verse span
    if (verses.length === 0) {
      const verseSpan = parent.closest('span[data-verse]');
      if (verseSpan) {
        const num = parseInt(verseSpan.getAttribute('data-verse') || '', 10);
        if (!isNaN(num)) verses.push(num);
      }
    }
    setSelectedVerses(verses);

    // Position the toolbar above the selection
    const rect = range.getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, [checkSelection]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const toolbar = document.getElementById('selection-toolbar');
      if (toolbar && !toolbar.contains(e.target as Node)) {
        // Small delay to allow the selection to be processed
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) setPosition(null);
        }, 100);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCopy = async () => {
    const quoteText = selectedVerses.length > 0
      ? `"${selectedText}" — ${book} ${chapter}:${selectedVerses.join('-')}`
      : `"${selectedText}" — ${book} ${chapter}`;
    try {
      await navigator.clipboard.writeText(quoteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = quoteText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleShare = async () => {
    const quoteText = selectedVerses.length > 0
      ? `"${selectedText}" — ${book} ${chapter}:${selectedVerses.join('-')}`
      : `"${selectedText}" — ${book} ${chapter}`;
    try {
      await navigator.share?.({ title: `${book} ${chapter}`, text: quoteText });
    } catch {
      handleCopy();
    }
  };

  const handleHighlight = async (color: HighlightColor) => {
    if (!state.isSignedIn || selectedVerses.length === 0) return;
    const startVerse = Math.min(...selectedVerses);
    const endVerse = Math.max(...selectedVerses);
    try {
      await addHighlight({
        bookId,
        book,
        chapter,
        verse: startVerse,
        startVerse,
        endVerse,
        color,
      });
      setPosition(null);
      window.getSelection()?.removeAllRanges();
    } catch { /* ignore */ }
  };

  const handleBookmark = async () => {
    if (!state.isSignedIn || selectedVerses.length === 0) return;
    try {
      await addBookmark({
        bookId,
        book,
        chapter,
        verse: selectedVerses[0],
        version: state.version,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* ignore */ }
  };

  if (!position) return null;

  return (
    <div
      id="selection-toolbar"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        zIndex: 60,
        backgroundColor: '#1e1e1e',
        border: '1px solid #3a3a3a',
        borderRadius: 12,
        padding: '8px 10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 200,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Highlight colors row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        {HIGHLIGHT_COLORS.map(({ color, hex }) => (
          <button
            key={color}
            onClick={() => handleHighlight(color)}
            disabled={!state.isSignedIn}
            title={state.isSignedIn ? `Highlight ${color}` : 'Sign in to highlight'}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              backgroundColor: hex,
              border: '2px solid rgba(255,255,255,0.15)',
              cursor: state.isSignedIn ? 'pointer' : 'not-allowed',
              opacity: state.isSignedIn ? 1 : 0.4,
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={handleCopy}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '6px 8px',
            borderRadius: 8,
            backgroundColor: '#2a2a2a',
            border: 'none',
            cursor: 'pointer',
            color: copied ? '#B09A6D' : '#ccc',
            fontFamily: 'Roboto, sans-serif',
            fontSize: 12,
          }}
        >
          {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={handleShare}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '6px 8px',
            borderRadius: 8,
            backgroundColor: '#2a2a2a',
            border: 'none',
            cursor: 'pointer',
            color: '#ccc',
            fontFamily: 'Roboto, sans-serif',
            fontSize: 12,
          }}
        >
          <ShareIcon size={13} color="#ccc" />
          Share
        </button>
        <button
          onClick={handleBookmark}
          disabled={!state.isSignedIn}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '6px 8px',
            borderRadius: 8,
            backgroundColor: '#2a2a2a',
            border: 'none',
            cursor: state.isSignedIn ? 'pointer' : 'not-allowed',
            color: saved ? '#B09A6D' : '#ccc',
            fontFamily: 'Roboto, sans-serif',
            fontSize: 12,
            opacity: state.isSignedIn ? 1 : 0.5,
          }}
        >
          {saved ? <Check size={13} strokeWidth={2} /> : <Bookmark size={13} strokeWidth={1.5} />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Arrow pointing down */}
      <div style={{
        position: 'absolute',
        bottom: -6,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '6px solid #1e1e1e',
      }} />
    </div>
  );
}
