import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBooks, getRecentBooks, fetchTopics } from '@/services/bibleService';
import { BibleBook, Topic } from '@/services/types';
import { ChevronRight, Search, ArrowLeft, Clock } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

interface Props {
  onClose: () => void;
  onSelect: (book: string, chapter: number, bookId?: number) => void;
}

type Tab = 'OT' | 'NT' | 'Topics';

/**
 * BookSelector — unified Search screen with OT / NT / Topics tabs.
 * Figma reference: frames 5172:3418 (OT), 5172:7984 (NT), and the Topics layout in frame 5895:4982.
 * Overlayed on top of Reading via a modal-full-screen pattern.
 */
export default function BookSelector({ onClose, onSelect }: Props) {
  const navigate = useNavigate();
  const { state } = useApp();
  const [tab, setTab] = useState<Tab>(() =>
    // Default to whichever testament the current book belongs to
    ['Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'].includes(state.book) ? 'NT' : 'OT'
  );
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [allBooks, setAllBooks] = useState<BibleBook[]>([]);
  const [recents, setRecents] = useState<BibleBook[]>([]);

  useEffect(() => {
    fetchBooks().then(books => {
      setAllBooks(books);
      // Resolve recently viewed book IDs from localStorage against the full list
      const recentIds = getRecentBooks().map(r => r.bookId);
      setRecents(
        recentIds
          .map(id => books.find(b => b.bookId === id))
          .filter((b): b is BibleBook => !!b)
          .slice(0, 5)
      );
    });
    fetchTopics().then(setTopics);
  }, []);

  const books = useMemo(
    () => allBooks.filter(b => b.testament === tab),
    [allBooks, tab]
  );

  const filteredBooks = useMemo(
    () => books.filter(b => b.name.toLowerCase().includes(query.toLowerCase())),
    [books, query]
  );

  const filteredTopics = useMemo(
    () => topics.filter(t => t.name.toLowerCase().includes(query.toLowerCase())),
    [topics, query]
  );

  const selectedBookObj = selectedBook
    ? allBooks.find(b => b.name === selectedBook)
    : null;

  // Chapter picker view
  if (selectedBookObj) {
    return (
      <div className="absolute inset-0 z-50 bg-dark-surface flex flex-col animate-fade-in text-dark-fg">
        <header
          className="shrink-0 safe-top"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)' }}
        >
          <div className="relative flex items-center justify-center px-3" style={{ height: 56 }}>
            <button
              onClick={() => setSelectedBook(null)}
              aria-label="Back"
              className="absolute left-2 w-[44px] h-[44px] flex items-center justify-center"
            >
              <ArrowLeft size={22} className="text-dark-fg" strokeWidth={2} />
            </button>
            <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 18, lineHeight: '24px', letterSpacing: '-0.01em' }}>{selectedBook}</h2>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-6">
          <p className="text-[13px] text-dark-muted mb-3">Select a chapter</p>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: selectedBookObj.chapters }, (_, i) => i + 1).map(ch => (
              <button
                key={ch}
                onClick={() => onSelect(selectedBook, ch, selectedBookObj.bookId)}
                className="h-12 rounded-xl bg-dark-raised border border-dark text-dark-fg text-[14px] font-medium"
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-dark-surface flex flex-col animate-fade-in text-dark-fg">
      {/* Header: Search title */}
      <header
        className="shrink-0 safe-top"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)' }}
      >
        <div className="relative flex items-center justify-center px-3" style={{ height: 56 }}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute left-2 w-[44px] h-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} className="text-dark-fg" strokeWidth={2} />
          </button>
          <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 18, lineHeight: '24px', letterSpacing: '-0.01em' }}>Search</h2>
        </div>
      </header>

      {/* Segmented tabs */}
      <div className="px-4 pt-2">
        <div className="flex items-center rounded-full bg-dark-raised p-1">
          {(['OT', 'NT', 'Topics'] as Tab[]).map(t => {
            const label = t === 'OT' ? 'Old Testament' : t === 'NT' ? 'New Testament' : 'Topics';
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setQuery('');
                }}
                className={`flex-1 h-10 rounded-full transition-colors ${
                  tab === t ? 'bg-gold text-[#1A1A1A]' : 'text-dark-fg/80'
                }`}
                style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 14, lineHeight: '24px' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search input */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 h-12 px-4 rounded-full bg-dark-raised border border-dark">
          <Search size={18} className="text-dark-muted" strokeWidth={2} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-dark-fg placeholder:text-dark-muted focus:outline-none"
            style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, lineHeight: '24px' }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {tab === 'Topics' ? (
          filteredTopics.length > 0 ? (
            <div>
              {filteredTopics.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    onClose();
                    navigate(`/topics/${t.id}`);
                  }}
                  className="flex items-center justify-between w-full h-[56px] border-b border-dark"
                >
                  <span className="text-[16px] text-dark-fg text-left">{t.name}</span>
                  <ChevronRight size={18} className="text-dark-muted" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState query={query} loading={topics.length === 0 && !query} what="topics" />
          )
        ) : filteredBooks.length > 0 ? (
          <div>
            {/* Recents (only when no active query) */}
            {!query && recents.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wider text-dark-muted/70 text-center py-3 border-t border-dark">
                  Recents
                </p>
                {recents.map(b => {
                  const isCurrent = b.name === state.book;
                  return (
                    <button
                      key={`recent-${b.bookId}`}
                      onClick={() => setSelectedBook(b.name)}
                      className="flex items-center justify-between w-full h-[52px] border-b border-dark"
                    >
                      <span
                        className={`text-[16px] text-left ${
                          isCurrent ? 'text-gold font-medium' : 'text-dark-fg'
                        }`}
                      >
                        {b.name}
                      </span>
                      <Clock size={16} className="text-dark-muted" strokeWidth={1.75} />
                    </button>
                  );
                })}
                <p className="text-[11px] uppercase tracking-wider text-dark-muted/70 text-center py-3 border-t border-dark">
                  All Books
                </p>
              </>
            )}
            {filteredBooks.map(b => {
              const isCurrent = b.name === state.book;
              return (
                <button
                  key={b.name}
                  onClick={() => setSelectedBook(b.name)}
                  className="flex items-center justify-between w-full h-[56px] border-b border-dark"
                >
                  <span
                    className={`text-[16px] text-left ${
                      isCurrent ? 'text-gold font-medium' : 'text-dark-fg'
                    }`}
                  >
                    {b.name}
                  </span>
                  <ChevronRight size={18} className="text-dark-muted" />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState query={query} loading={allBooks.length === 0 && !query} what="books" />
        )}
      </div>
    </div>
  );
}

function EmptyState({ query, loading, what }: { query: string; loading: boolean; what: 'books' | 'topics' }) {
  if (loading) {
    return <p className="text-center text-dark-muted text-[14px] py-8">Loading {what}…</p>;
  }
  if (query) {
    return (
      <p className="text-center text-dark-muted text-[14px] py-8">
        No {what} match "{query}"
      </p>
    );
  }
  return <p className="text-center text-dark-muted text-[14px] py-8">No {what} available</p>;
}
