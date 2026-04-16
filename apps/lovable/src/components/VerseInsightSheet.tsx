import { useState, useEffect } from 'react';
import { fetchVerseInsights, fetchChapter } from '@/services/bibleService';
import { VerseInsight, Chapter, BibleVersion } from '@/services/types';
import { ChevronLeft, ChevronRight, Copy, Bookmark, Check } from 'lucide-react';
import MarkdownBlock from '@/components/MarkdownBlock';
import { useApp } from '@/contexts/AppContext';
import ShareIcon from '@/components/ShareIcon';

interface Props {
  book: string;
  chapter: number;
  verse: number;
  version: BibleVersion;
  onClose: () => void;
}

/**
 * Strip the first heading + first blockquote from the API markdown
 * since we already show the verse reference and text at the top.
 */
function stripDuplicateVerse(text: string): string {
  let result = text;
  // Remove first heading line (e.g. "Genesis 1:6" or "# Genesis 1:6")
  result = result.replace(/^#*\s*\S+\s+\d+:\d+\s*\n?/, '');
  // Remove first blockquote block (the verse text)
  result = result.replace(/^>\s*.*(?:\n>\s*.*)*\n?/, '').trimStart();
  return result;
}

export default function VerseInsightSheet({
  book,
  chapter,
  verse,
  version,
  onClose,
}: Props) {
  const { state, addHighlight } = useApp();
  const [insights, setInsights] = useState<VerseInsight[]>([]);
  const [chapterData, setChapterData] = useState<Chapter | null>(null);
  const [currentVerse, setCurrentVerse] = useState<number>(verse);
  const [copiedAt, setCopiedAt] = useState<number>(0);
  const [savedAt, setSavedAt] = useState<number>(0);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchVerseInsights(book, chapter).then(setInsights);
    fetchChapter(book, chapter, version).then(setChapterData);
  }, [book, chapter, version]);

  useEffect(() => {
    setCurrentVerse(verse);
  }, [verse]);

  const insight = insights.find(i => i.verse === currentVerse);
  const verseText =
    chapterData?.verses.find(v => v.number === currentVerse)?.text || '';
  const maxVerse = chapterData?.verses.length || 1;

  const step = (delta: number) => {
    const next = currentVerse + delta;
    if (next >= 1 && next <= maxVerse) setCurrentVerse(next);
  };

  const quoteText = verseText
    ? `"${verseText}" — ${book} ${chapter}:${currentVerse}`
    : `${book} ${chapter}:${currentVerse}`;

  const handleCopy = async () => {
    setActionError(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(quoteText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = quoteText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedAt(Date.now());
      setTimeout(() => setCopiedAt(0), 1500);
    } catch {
      setActionError('Copy failed — clipboard not available here');
    }
  };

  const handleShare = async () => {
    setActionError(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${book} ${chapter}:${currentVerse}`,
          text: quoteText,
        });
      } else {
        await handleCopy();
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setActionError('Share failed');
      }
    }
  };

  const handleSaveHighlight = async () => {
    setActionError(null);
    if (!state.isSignedIn) {
      setActionError('Sign in to save highlights');
      return;
    }
    try {
      await addHighlight({
        bookId: state.bookId,
        book,
        chapter,
        verse: currentVerse,
        startVerse: currentVerse,
        endVerse: currentVerse,
        color: 'yellow',
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(0), 1500);
    } catch {
      setActionError('Save failed — please try again');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-black/60 animate-fade-in"
        onClick={onClose}
      />
      {/* Sheet — slides up from bottom; narrower on desktop */}
      <div
        className="verse-insight-sheet absolute inset-x-0 bottom-0 z-50 bg-dark-surface text-dark-fg rounded-t-[24px] border-t border-dark shadow-[0_-10px_30px_rgba(0,0,0,0.5)] animate-slide-up flex flex-col"
        style={{ maxHeight: '98%', minHeight: '80%' }}
        role="dialog"
        aria-label="Verse Insight"
      >
        {/* Drag handle */}
        <div className="shrink-0 pt-2 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-dark-muted/40" />
        </div>

        {/* Title */}
        <h2 className="text-center text-[16px] text-gold font-medium mt-2">
          Verse Insight
        </h2>

        {/* Verse stepper — arrows at the edges (justify-between) */}
        <div className="flex items-center justify-between px-5 mt-2">
          <button
            onClick={() => step(-1)}
            disabled={currentVerse <= 1}
            aria-label="Previous verse"
            className="w-9 h-9 rounded-full bg-dark-raised border border-dark flex items-center justify-center disabled:opacity-30 shrink-0"
          >
            <ChevronLeft size={18} className="text-dark-fg" />
          </button>
          <div className="text-[17px] font-medium text-dark-fg">
            {book} {chapter}:{currentVerse}
          </div>
          <button
            onClick={() => step(1)}
            disabled={currentVerse >= maxVerse}
            aria-label="Next verse"
            className="w-9 h-9 rounded-full bg-dark-raised border border-dark flex items-center justify-center disabled:opacity-30 shrink-0"
          >
            <ChevronRight size={18} className="text-dark-fg" />
          </button>
        </div>

        {/* Quoted verse — pushed down for breathing room under the stepper */}
        {verseText && (
          <p className="px-6 mt-4 text-center text-[14px] italic text-dark-muted leading-snug">
            "{verseText}"
          </p>
        )}

        {/* Analysis panel — outer px-4 aligns with action-button row below.
            Inner grey box is content-sized (no flex-1) so short commentary
            doesn't stretch an empty grey card down to the buttons. Outer
            keeps flex-1 + scroll for long commentary. */}
        <div className="flex-1 overflow-y-auto px-4 mt-6 pb-2" style={{ minHeight: 0 }}>
          <div className="rounded-xl bg-dark-raised border border-dark p-5" style={{ fontSize: 15 }}>
            {insight ? (
              <MarkdownBlock text={stripDuplicateVerse(insight.historicalContext)} />
            ) : (
              <p className="text-[15px] text-dark-muted text-center py-4">
                No insight available for this verse.
              </p>
            )}
            {insight && insight.crossReferences.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dark">
                <p className="text-[11px] uppercase tracking-wide text-dark-muted/70 mb-1.5">
                  Cross references
                </p>
                <div className="flex flex-wrap gap-1">
                  {insight.crossReferences.map(ref => (
                    <span
                      key={ref}
                      className="text-[11px] text-dark-fg/90 bg-dark-surface rounded px-1.5 py-0.5 border border-dark"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions — single row: Copy | Share | Save */}
        <div className="shrink-0 px-4 pb-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleCopy}
              className="h-10 rounded-xl bg-dark-raised border border-dark flex items-center justify-center gap-1.5"
            >
              {copiedAt ? <Check size={14} className="text-gold" strokeWidth={2} /> : <Copy size={14} className="text-dark-fg" strokeWidth={1.5} />}
              <span className="text-[12px]" style={{ color: copiedAt ? '#B09A6D' : '#ccc' }}>{copiedAt ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleShare}
              className="h-10 rounded-xl bg-dark-raised border border-dark flex items-center justify-center gap-1.5"
            >
              <ShareIcon size={14} color="#ccc" />
              <span className="text-[12px] text-[#ccc]">Share</span>
            </button>
            <button
              onClick={handleSaveHighlight}
              className="h-10 rounded-xl bg-dark-raised border border-dark flex items-center justify-center gap-1.5"
            >
              {savedAt ? <Check size={14} className="text-gold" strokeWidth={2} /> : <Bookmark size={14} className="text-dark-fg" strokeWidth={1.5} />}
              <span className="text-[12px]" style={{ color: savedAt ? '#B09A6D' : '#ccc' }}>{savedAt ? 'Saved' : 'Save'}</span>
            </button>
          </div>
          {actionError && <p className="text-[11px] text-red-400 text-center mt-1">{actionError}</p>}
        </div>

        {/* Close button */}
        <div className="shrink-0 px-4 pb-4 safe-bottom">
          <button
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-gold text-[#1A1A1A] font-medium text-[15px]"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
