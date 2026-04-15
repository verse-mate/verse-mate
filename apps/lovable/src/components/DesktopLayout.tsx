import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { fetchCommentary, fetchBooks } from '@/services/bibleService';
import { BibleBook } from '@/services/types';
import { Commentary } from '@/services/types';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Menu,
  User,
  Bookmark,
  FileText,
  Highlighter,
  Settings,
  Info,
  Heart,
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react';
import ShareIcon from '@/components/ShareIcon';
import BookSelector from '@/components/BookSelector';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import BookmarksScreen from '@/pages/BookmarksScreen';
import NotesScreen from '@/pages/NotesScreen';
import HighlightsScreen from '@/pages/HighlightsScreen';
import SettingsScreen from '@/pages/SettingsScreen';
import AboutScreen from '@/pages/AboutScreen';
import GivingScreen from '@/pages/GivingScreen';
import HelpScreen from '@/pages/HelpScreen';
import SignInScreen from '@/pages/SignInScreen';

type RightPanelView = 'commentary' | 'bookmarks' | 'notes' | 'highlights' | 'settings' | 'about' | 'giving' | 'help' | 'signin';

const RIGHT_PANEL_COMPONENTS: Record<Exclude<RightPanelView, 'commentary'>, { component: React.FC; label: string }> = {
  bookmarks: { component: BookmarksScreen, label: 'Bookmarks' },
  notes: { component: NotesScreen, label: 'Notes' },
  highlights: { component: HighlightsScreen, label: 'Highlights' },
  settings: { component: SettingsScreen, label: 'Settings' },
  about: { component: AboutScreen, label: 'About' },
  giving: { component: GivingScreen, label: 'Giving' },
  help: { component: HelpScreen, label: 'Help' },
  signin: { component: SignInScreen, label: 'Sign In' },
};

type Tab = 'summary' | 'byline' | 'detailed';

const MIN_LEFT_PCT = 35;
const MAX_LEFT_PCT = 80;
const SIDEBAR_COLLAPSED = 56;
const SIDEBAR_EXPANDED = 220;

/**
 * DesktopLayout — split-view for ≥1024px viewports.
 *
 * Far-left: persistent mini-sidebar with book list
 * Left panel (resizable): current Bible reading content via <Outlet />
 * Drag handle: resize between panels
 * Right panel (remainder): commentary for the current book/chapter
 * Shared header: spans full width (minus sidebar)
 */
export default function DesktopLayout({ hideSidebar = false }: { hideSidebar?: boolean }) {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [showBookSelector, setShowBookSelector] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!hideSidebar);
  // Sidebar always stays at expanded width; expandedBook controls chapter grid visibility
  const [expandedBook, setExpandedBook] = useState<string | null>(state.book);

  // Right panel: only one menu page at a time, back always returns to commentary
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>('commentary');

  const openRightPanel = (view: RightPanelView) => {
    setRightPanelView(view);
  };
  const closeRightPanel = () => {
    setRightPanelView('commentary');
  };

  // Resizable split state (percentage of content area, not including sidebar)
  const [leftPct, setLeftPct] = useState(65);
  const isDragging = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Right panel commentary state
  const [tab, setTab] = useState<Tab>('byline');
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [expanded, setExpanded] = useState<number | null>(-2); // -2 = all expanded by default
  const commentaryScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCommentary(state.book, state.chapter).then(setCommentaries);
    setExpanded(-2); // Reset to all-expanded on chapter change
    commentaryScrollRef.current?.scrollTo(0, 0); // Scroll commentary to top
  }, [state.book, state.chapter]);

  // Auto-scroll removed — users scroll the Insights panel independently

  // On desktop, redirect commentary route back to /read since we show it inline
  useEffect(() => {
    if (location.pathname.includes('/commentary')) {
      navigate('/read', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Keyboard navigation: left/right arrow keys for chapter switching
  const [books, setBooks] = useState<BibleBook[]>([]);
  useEffect(() => { fetchBooks().then(setBooks); }, []);
  const currentBook = books.find(b => b.name === state.book);
  const maxChapter = currentBook?.chapters || 1;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowLeft' && state.chapter > 1) {
      dispatch({ type: 'SET_PASSAGE', book: state.book, chapter: state.chapter - 1 });
    } else if (e.key === 'ArrowRight' && state.chapter < maxChapter) {
      dispatch({ type: 'SET_PASSAGE', book: state.book, chapter: state.chapter + 1 });
    }
  }, [state.book, state.chapter, maxChapter, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Drag-to-resize handlers ───
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isDragging.current || !contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.round((x / rect.width) * 100);
      setLeftPct(Math.max(MIN_LEFT_PCT, Math.min(MAX_LEFT_PCT, pct)));
    };
    const handleUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'byline', label: 'By Line' },
    { id: 'detailed', label: 'Detailed' },
  ];

  const otBooks = books.filter(b => b.testament === 'OT');
  const ntBooks = books.filter(b => b.testament === 'NT');

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100dvh', overflow: 'hidden', backgroundColor: '#1B1B1B' }}>
      {/* ─── PERSISTENT SIDEBAR — expands on book click to show chapters ─── */}
      {sidebarOpen && (
        <div
          style={{
            width: SIDEBAR_EXPANDED,
            flexShrink: 0,
            height: '100%',
            backgroundColor: '#111111',
            borderRight: '1px solid #2a2a2a',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Sidebar header — "Bible" label */}
          <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0, borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: 15, fontWeight: 600, color: '#B09A6D', letterSpacing: '0.5px' }}>Bible</span>
          </div>
          {/* Book list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }} className="mini-sidebar-scroll">
            <SidebarSection
              label="Old Testament"
              books={otBooks}
              activeBook={state.book}
              activeChapter={state.chapter}
              expandedBook={expandedBook}
              onBookClick={(b) => setExpandedBook(expandedBook === b.name ? null : b.name)}
              onChapterClick={(b, ch) => {
                dispatch({ type: 'SET_PASSAGE', book: b.name, chapter: ch, bookId: b.bookId });
                navigate('/read');
              }}
              isExpanded={true}
            />
            <SidebarSection
              label="New Testament"
              books={ntBooks}
              activeBook={state.book}
              activeChapter={state.chapter}
              expandedBook={expandedBook}
              onBookClick={(b) => setExpandedBook(expandedBook === b.name ? null : b.name)}
              onChapterClick={(b, ch) => {
                dispatch({ type: 'SET_PASSAGE', book: b.name, chapter: ch, bookId: b.bookId });
                navigate('/read');
              }}
              isExpanded={true}
            />
          </div>
        </div>
      )}

      {/* ─── MAIN CONTENT AREA (header + split panels) ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ─── SHARED FULL-WIDTH HEADER ─── */}
        <header
          style={{
            flexShrink: 0,
            height: 56,
            backgroundColor: '#1A1A1A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderBottom: '1px solid #2a2a2a',
            position: 'relative',
          }}
        >
          {/* Left: Book/chapter dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setShowBookSelector(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', minHeight: 44 }}
            >
              <span style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 14, lineHeight: '24px', color: '#FFFFFF' }}>
                {state.book} {state.chapter}
              </span>
              <ChevronDown size={18} color="#FFFFFF" strokeWidth={2} />
            </button>
          </div>

          {/* Center: VerseMate logo */}
          <img src="/versemate-logo-white.png" alt="VerseMate" style={{ height: 20, objectFit: 'contain', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} />

          {/* Right: commentary tabs (when in commentary view) + menu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {rightPanelView === 'commentary' && (
              <div style={{ display: 'flex', backgroundColor: '#323232', borderRadius: 100, padding: '3px' }}>
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      borderRadius: 100,
                      padding: '3px 14px',
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: 13,
                      fontWeight: 400,
                      lineHeight: '22px',
                      backgroundColor: tab === t.id ? '#B09A6D' : 'transparent',
                      color: tab === t.id ? '#000000' : '#FFFFFF',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Open menu"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Menu size={22} color="#FFFFFF" strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* ─── SPLIT BODY ─── */}
        <div ref={contentRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* LEFT PANEL — Bible reading */}
          <div
            style={{
              width: `${leftPct}%`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Outlet />
          </div>

          {/* DRAG HANDLE */}
          <div
            onMouseDown={handleDragStart}
            style={{
              width: 6,
              flexShrink: 0,
              cursor: 'col-resize',
              backgroundColor: '#2a2a2a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 10,
            }}
          >
            {/* Visual grip dots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: '#555' }} />
              ))}
            </div>
          </div>

          {/* RIGHT PANEL — Commentary or menu page content */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: '#1B1B1B',
            }}
          >
            {rightPanelView === 'commentary' ? (
              <>
                {/* Commentary body — tabs now in top header */}
                <div ref={commentaryScrollRef} style={{ flex: 1, overflowY: 'auto', backgroundColor: '#000000', color: '#FFFFFF', padding: '16px 16px 32px', fontFamily: "'Roboto Serif', Georgia, serif", fontWeight: 300, fontSize: `${state.settings.fontSize}px`, lineHeight: '34px' }}>
                  <CommentaryPanel
                    tab={tab}
                    commentaries={commentaries}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    book={state.book}
                    chapter={state.chapter}
                  />
                </div>
              </>
            ) : (
              /* Menu page content — wrapped with RightPanelProvider so ScreenHeader back buttons work */
              <RightPanelProvider value={{ goBack: closeRightPanel, isRightPanel: true }}>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {(() => {
                    const entry = RIGHT_PANEL_COMPONENTS[rightPanelView];
                    if (!entry) return null;
                    const PageComponent = entry.component;
                    return <PageComponent />;
                  })()}
                </div>
              </RightPanelProvider>
            )}
          </div>
        </div>
      </div>

      {/* Menu sidebar overlay — fixed to viewport so it always appears correctly */}
      {showMenu && (
        <>
          <div
            onClick={() => setShowMenu(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }}
          />
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              width: 280,
              height: '100%',
              backgroundColor: '#1B1B1B',
              zIndex: 50,
              boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <MenuSidebar
              onClose={() => setShowMenu(false)}
              onOpenPage={(view: RightPanelView) => { openRightPanel(view); setShowMenu(false); }}
            />
          </div>
        </>
      )}

      {/* Book selector overlay — constrained to a centered modal on desktop */}
      {showBookSelector && (
        <>
          <div
            onClick={() => setShowBookSelector(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 55 }}
          />
          <div style={{
            position: 'fixed',
            top: '10vh',
            /* Center over Bible (left) panel */
            left: `${(sidebarOpen ? SIDEBAR_EXPANDED : 0) + (contentRef.current ? contentRef.current.getBoundingClientRect().width * leftPct / 100 / 2 : 300)}px`,
            transform: 'translateX(-50%)',
            width: 420,
            height: '80vh',
            zIndex: 56,
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}>
            <BookSelector
              onClose={() => setShowBookSelector(false)}
              onSelect={(book, ch, bookId) => {
                dispatch({ type: 'SET_PASSAGE', book, chapter: ch, bookId });
                setShowBookSelector(false);
                navigate('/read');
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sidebar Section (OT / NT) with expandable chapter grid ─────────────────

function SidebarSection({
  label,
  books: sectionBooks,
  activeBook,
  activeChapter,
  expandedBook,
  onBookClick,
  onChapterClick,
  isExpanded,
}: {
  label: string;
  books: BibleBook[];
  activeBook: string;
  activeChapter: number;
  expandedBook: string | null;
  onBookClick: (b: BibleBook) => void;
  onChapterClick: (b: BibleBook, ch: number) => void;
  isExpanded: boolean;
}) {
  return (
    <>
      <div style={{ fontFamily: 'Roboto, sans-serif', fontSize: 12, fontWeight: 700, color: '#B09A6D', textAlign: 'left', padding: '14px 12px 6px', letterSpacing: '0.5px' }}>{label}</div>
      {sectionBooks.map(b => {
        const isActive = activeBook === b.name;
        const isBookExpanded = expandedBook === b.name;
        return (
          <div key={b.bookId}>
            <button
              onClick={() => onBookClick(b)}
              title={b.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: isExpanded ? '6px 12px' : '5px 4px',
                fontFamily: 'Roboto, sans-serif',
                fontSize: isExpanded ? 13 : 10,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#B09A6D' : 'rgba(255,255,255,0.6)',
                backgroundColor: isBookExpanded ? 'rgba(176,154,109,0.08)' : isActive ? 'rgba(176,154,109,0.12)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: isExpanded ? 'left' : 'center',
                lineHeight: '18px',
                borderLeft: isActive ? '2px solid #B09A6D' : '2px solid transparent',
                justifyContent: isExpanded ? 'space-between' : 'center',
                gap: 4,
              }}
            >
              <span>{isExpanded ? b.name : b.shortName}</span>
              {isExpanded && (
                <ChevronDown
                  size={12}
                  color="rgba(255,255,255,0.3)"
                  style={{ flexShrink: 0, transform: isBookExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                />
              )}
            </button>
            {/* Chapter grid — only shown when expanded */}
            {isBookExpanded && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, padding: '4px 10px 8px' }}>
                {Array.from({ length: b.chapters }, (_, i) => i + 1).map(ch => (
                  <button
                    key={ch}
                    onClick={() => onChapterClick(b, ch)}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Roboto, sans-serif',
                      fontSize: 11,
                      fontWeight: isActive && activeChapter === ch ? 600 : 400,
                      color: isActive && activeChapter === ch ? '#000' : 'rgba(255,255,255,0.7)',
                      backgroundColor: isActive && activeChapter === ch ? '#B09A6D' : '#1e1e1e',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Commentary Panel ────────────────────────────────────────────────────────

function CommentaryPanel({
  tab,
  commentaries,
  expanded,
  setExpanded,
  book,
  chapter,
}: {
  tab: Tab;
  commentaries: Commentary[];
  expanded: number | null;
  setExpanded: (v: number | null) => void;
  book: string;
  chapter: number;
}) {
  if (commentaries.length === 0) {
    return (
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', paddingTop: 32 }}>
        No commentary available for this chapter.
      </p>
    );
  }

  if (tab === 'summary') {
    const summary = commentaries.find(c => c.type === 'summary');
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: '26px', color: '#E7E7E7', margin: 0 }}>
            Summary of {book} {chapter}
          </h2>
          <button
            onClick={() => navigator.share?.({ title: `Summary of ${book} ${chapter}`, text: `Summary of ${book} ${chapter}` }).catch(() => {})}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
            aria-label="Share summary"
          >
            <ShareIcon size={18} color="#E7E7E7" />
          </button>
        </div>
        {summary ? (
          <CommentaryBody text={summary.detail} />
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>No summary available.</p>
        )}
      </div>
    );
  }

  if (tab === 'byline') {
    const byLineItems = commentaries.filter(c => c.type === 'byline');
    const allExpanded = expanded === -2;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: '26px', color: '#E7E7E7', margin: 0 }}>
            Line-by-Line Analysis of {book} {chapter}
          </h2>
          <button
            onClick={() => navigator.share?.({ title: `Line-by-Line Analysis of ${book} ${chapter}`, text: `Line-by-Line Analysis of ${book} ${chapter}` }).catch(() => {})}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
            aria-label="Share line-by-line analysis"
          >
            <ShareIcon size={18} color="#E7E7E7" />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={() => setExpanded(allExpanded ? null : -2)}
            style={{ fontFamily: 'Roboto, sans-serif', fontSize: 13, color: '#B09A6D', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
        <div>
          {byLineItems.map(c => {
            const isOpen = allExpanded || expanded === c.verse;
            return (
              <div key={c.verse} data-byline-verse={c.verse} style={{ borderBottom: '1px solid #323232' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : c.verse)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 0', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, color: '#FFFFFF' }}>
                    {book} {chapter}:{c.verse}
                  </span>
                  {isOpen ? (
                    <ChevronUp size={16} color="rgba(255,255,255,0.6)" style={{ flexShrink: 0 }} />
                  ) : (
                    <ChevronDown size={16} color="rgba(255,255,255,0.6)" style={{ flexShrink: 0 }} />
                  )}
                </button>
                {isOpen && (
                  <div style={{ paddingBottom: 14 }}>
                    <CommentaryBody text={c.detail} />
                  </div>
                )}
              </div>
            );
          })}
          {byLineItems.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', paddingTop: 32 }}>
              Line-by-line analysis not available.
            </p>
          )}
        </div>
      </div>
    );
  }

  // detailed tab
  const detailed = commentaries.find(c => c.type === 'detailed');
  return detailed ? (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: '26px', color: '#E7E7E7', margin: 0 }}>
          In-Depth Analysis of {book} {chapter}
        </h2>
        <button
          onClick={() => navigator.share?.({ title: `In-Depth Analysis of ${book} ${chapter}`, text: `In-Depth Analysis of ${book} ${chapter}` }).catch(() => {})}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
          aria-label="Share in-depth analysis"
        >
          <ShareIcon size={18} color="#E7E7E7" />
        </button>
      </div>
      <CommentaryBody text={detailed.detail} />
    </div>
  ) : (
    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', paddingTop: 32 }}>
      Detailed commentary not available.
    </p>
  );
}

// ─── CommentaryBody ──────────────────────────────────────────────────────────

function CommentaryBody({ text }: { text: string }) {
  let processedText = text;
  const firstNewline = processedText.indexOf('\n');
  if (processedText.startsWith('# ') && firstNewline > 0) {
    processedText = processedText.slice(firstNewline + 1).trimStart();
  }
  const lines = processedText.split('\n');
  const elements: React.ReactNode[] = [];
  let para: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      elements.push(
        <p key={key++} style={{ fontFamily: 'inherit', fontWeight: 300, fontSize: 'inherit', lineHeight: 'inherit', color: 'rgba(255,255,255,0.87)', marginBottom: 10 }}>
          {inlineFormat(para.join(' '))}
        </p>
      );
      para = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushPara(); continue; }
    if (line.startsWith('#')) {
      flushPara();
      const heading = line.replace(/^#+\s*/, '');
      elements.push(
        <h2 key={key++} style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 16, lineHeight: '22px', color: '#E7E7E7', marginTop: 14, marginBottom: 6 }}>
          {inlineFormat(heading)}
        </h2>
      );
      continue;
    }
    if (line.startsWith('>')) {
      flushPara();
      elements.push(
        <blockquote key={key++} style={{ borderLeft: '2px solid #B09A6D', paddingLeft: 10, fontStyle: 'italic', marginBottom: 10, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', color: 'rgba(255,255,255,0.6)' }}>
          {inlineFormat(line.replace(/^>\s?/, ''))}
        </blockquote>
      );
      continue;
    }
    para.push(line);
  }
  flushPara();

  return <div>{elements}</div>;
}

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const match = m[0];
    if (match.startsWith('**')) {
      parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{match.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{match.slice(1, -1)}</em>);
    }
    last = m.index + match.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── Menu Sidebar (desktop overlay) ──────────────────────────────────────────

function MenuSidebar({ onClose, onOpenPage }: { onClose: () => void; onOpenPage?: (view: RightPanelView) => void }) {
  const navigate = useNavigate();
  const { state, signOut } = useApp();

  // Map menu labels → right panel view keys
  const menuItems: { label: string; icon: typeof Bookmark; view: RightPanelView }[] = [
    { label: 'Bookmarks', icon: Bookmark, view: 'bookmarks' },
    { label: 'Notes', icon: FileText, view: 'notes' },
    { label: 'Highlights', icon: Highlighter, view: 'highlights' },
    { label: 'Settings', icon: Settings, view: 'settings' },
    { label: 'About', icon: Info, view: 'about' },
    { label: 'Giving', icon: Heart, view: 'giving' },
    { label: 'Help', icon: HelpCircle, view: 'help' },
  ];

  const handleLogout = async () => {
    if (state.isSignedIn) {
      await signOut();
      navigate('/read');
    } else if (onOpenPage) {
      onOpenPage('signin');
      return;
    } else {
      navigate('/menu/signin');
    }
    onClose();
  };

  const handleShare = async () => {
    try {
      await navigator.share?.({ title: 'VerseMate', text: 'Read the Bible with VerseMate', url: window.location.origin });
    } catch {
      navigator.clipboard?.writeText(window.location.origin).catch(() => undefined);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1B1B1B' }}>
      <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 72, backgroundColor: '#1A1A1A', borderBottom: '1px solid #2a2a2a' }}>
        <h1 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 18, lineHeight: '24px', color: '#FFFFFF', margin: 0 }}>Menu</h1>
        <button onClick={onClose} aria-label="Close menu" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', marginRight: -8 }}>
          <X size={22} color="#FFFFFF" strokeWidth={2} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#000000', padding: '16px' }}>
        {/* User card */}
        <button
          onClick={() => { if (!state.isSignedIn) { if (onOpenPage) { onOpenPage('signin'); } else { navigate('/menu/signin'); onClose(); } } }}
          disabled={state.isSignedIn}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', height: 64, padding: '0 16px', borderRadius: 12, backgroundColor: '#323232', border: '1px solid #323232', marginBottom: 12, cursor: state.isSignedIn ? 'default' : 'pointer', textAlign: 'left' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B1B1B', flexShrink: 0 }}>
            <User size={20} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 14, lineHeight: '20px', color: '#B09A6D', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.isSignedIn ? state.userName || state.userEmail?.split('@')[0] || '' : 'Guest'}
            </p>
            <p style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 12, lineHeight: '18px', color: 'rgba(255,255,255,0.6)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.isSignedIn ? state.userEmail || 'Loading...' : 'Click to sign in'}
            </p>
          </div>
        </button>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={() => { if (onOpenPage) { onOpenPage(item.view); } else { navigate(`/${item.view}`); onClose(); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', height: 56, padding: '0 16px', borderRadius: 12, backgroundColor: '#323232', border: '1px solid #323232', cursor: 'pointer', textAlign: 'left' }}
            >
              <item.icon size={18} color="#E7E7E7" strokeWidth={1.5} />
              <span style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 15, lineHeight: '24px', color: '#E7E7E7' }}>{item.label}</span>
            </button>
          ))}
          <button
            onClick={handleShare}
            style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', height: 56, padding: '0 16px', borderRadius: 12, backgroundColor: '#323232', border: '1px solid #323232', cursor: 'pointer', textAlign: 'left' }}
          >
            <ShareIcon size={18} color="#E7E7E7" />
            <span style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 15, lineHeight: '24px', color: '#E7E7E7' }}>Share VerseMate</span>
          </button>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', height: 56, padding: '0 16px', borderRadius: 12, backgroundColor: '#323232', border: '1px solid #323232', cursor: 'pointer', textAlign: 'left', marginTop: 4 }}
          >
            <LogOut size={18} color="#f87171" strokeWidth={1.5} />
            <span style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 15, lineHeight: '24px', color: '#f87171' }}>
              {state.isSignedIn ? 'Logout' : 'Sign In'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
