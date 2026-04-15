import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCommentary } from '@/services/bibleService';
import { Commentary } from '@/services/types';
import { ChevronDown, ChevronUp, Menu } from 'lucide-react';
import MarkdownBlock from '@/components/MarkdownBlock';
import ShareIcon from '@/components/ShareIcon';

type Tab = 'summary' | 'byline' | 'detailed';

export default function CommentaryScreen() {
  const { book, chapter } = useParams<{ book: string; chapter: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('summary');
  const [commentaries, setCommentaries] = useState<Commentary[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const decodedBook = decodeURIComponent(book || '');
  const chapterNum = parseInt(chapter || '1', 10);

  useEffect(() => {
    fetchCommentary(decodedBook, chapterNum).then(setCommentaries);
  }, [decodedBook, chapterNum]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'byline', label: 'By Line' },
    { id: 'detailed', label: 'Detailed' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
      {/* Header — #1A1A1A dark, Insight pill gold (active), Bible pill white (inactive) */}
      <header
        className="shrink-0 safe-top"
        style={{ backgroundColor: '#1A1A1A', paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)' }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: 56 }}>
          <button
            onClick={() => navigate(`/read`)}
            className="flex items-center gap-1.5 min-h-[44px] pr-2 -ml-1"
            style={{ color: '#FFFFFF' }}
          >
            <span style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 14, lineHeight: '24px', color: '#FFFFFF' }}>
              {decodedBook} {chapterNum}
            </span>
            <ChevronDown size={18} style={{ color: '#FFFFFF' }} strokeWidth={2} />
          </button>

          <div className="flex items-center gap-2">
            {/* Pill container */}
            <div style={{ display: 'flex', backgroundColor: '#323232', borderRadius: 100, padding: '3px' }}>
              {/* Bible pill — inactive */}
              <button
                aria-label="Bible"
                onClick={() => navigate('/read')}
                style={{
                  fontFamily: 'Roboto, sans-serif',
                  fontWeight: 400,
                  fontSize: 14,
                  lineHeight: '24px',
                  padding: '2px 12px',
                  borderRadius: 100,
                  backgroundColor: 'transparent',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Bible
              </button>
              {/* Insight pill — active (gold) */}
              <button
                aria-label="Insight"
                style={{
                  fontFamily: 'Roboto, sans-serif',
                  fontWeight: 400,
                  fontSize: 14,
                  lineHeight: '24px',
                  padding: '2px 12px',
                  borderRadius: 100,
                  backgroundColor: '#B09A6D',
                  color: '#000000',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Insight
              </button>
            </div>
            <button
              onClick={() => navigate('/menu')}
              aria-label="Open menu"
              className="flex items-center justify-center w-[44px] h-[44px] -mr-2"
            >
              <Menu size={22} style={{ color: '#FFFFFF' }} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* Tab pills — dark subheader (#1A1A1A), pills in #323232 container */}
      <div
        className="shrink-0"
        style={{ backgroundColor: '#1A1A1A', display: 'flex', justifyContent: 'center', padding: '12px 16px' }}
      >
        <div style={{ display: 'flex', backgroundColor: '#323232', borderRadius: 100, padding: '3px', gap: 0 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                borderRadius: 100,
                padding: '4px 16px',
                fontFamily: 'Roboto, sans-serif',
                fontSize: 14,
                fontWeight: 400,
                lineHeight: '24px',
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
      </div>

      {/* Body — BLACK background, white text */}
      <div className="flex-1 overflow-y-auto px-4 pb-8" style={{ backgroundColor: '#000000', color: '#FFFFFF' }}>
        {commentaries.length === 0 ? (
          <p className="text-[14px] text-center py-8" style={{ color: 'rgba(255,255,255,0.6)' }}>
            No commentary available for this chapter.
          </p>
        ) : tab === 'summary' ? (
          <div className="pt-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 20, lineHeight: '28px', color: '#E7E7E7', margin: 0 }}>
                Summary of {decodedBook} {chapterNum}
              </h2>
              <button
                onClick={() => navigator.share?.({ title: `Summary of ${decodedBook} ${chapterNum}`, text: `Summary of ${decodedBook} ${chapterNum}` }).catch(() => {})}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
                aria-label="Share summary"
              >
                <ShareIcon size={20} color="#E7E7E7" />
              </button>
            </div>
            {(() => {
              const summary = commentaries.find(c => c.type === 'summary');
              return summary ? (
                <CommentaryBody text={summary.detail} />
              ) : (
                <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.6)' }}>No summary available.</p>
              );
            })()}
          </div>
        ) : tab === 'byline' ? (
          (() => {
            const byLineItems = commentaries.filter(c => c.type === 'byline');
            const allExpanded = expanded === -2;
            return (
              <div className="pt-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 20, lineHeight: '28px', color: '#E7E7E7', margin: 0 }}>
                    Line-by-Line Analysis of {decodedBook} {chapterNum}
                  </h2>
                  <button
                    onClick={() => navigator.share?.({ title: `Line-by-Line Analysis of ${decodedBook} ${chapterNum}`, text: `Line-by-Line Analysis of ${decodedBook} ${chapterNum}` }).catch(() => {})}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
                    aria-label="Share line-by-line analysis"
                  >
                    <ShareIcon size={20} color="#E7E7E7" />
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
                      <div key={c.verse} style={{ borderBottom: '1px solid #323232' }}>
                        <button
                          onClick={() => setExpanded(isOpen ? null : c.verse)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 0', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: 15, color: '#FFFFFF' }}>
                            {decodedBook} {chapterNum}:{c.verse}
                          </span>
                          {isOpen ? (
                            <ChevronUp size={18} color="rgba(255,255,255,0.6)" style={{ flexShrink: 0 }} />
                          ) : (
                            <ChevronDown size={18} color="rgba(255,255,255,0.6)" style={{ flexShrink: 0 }} />
                          )}
                        </button>
                        {isOpen && (
                          <div style={{ paddingBottom: 16 }}>
                            <CommentaryBody text={c.detail} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {byLineItems.length === 0 && (
                    <p className="text-[14px] py-8 text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      Line-by-line analysis not available.
                    </p>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          (() => {
            const detailed = commentaries.find(c => c.type === 'detailed');
            return detailed ? (
              <div className="pt-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 20, lineHeight: '28px', color: '#E7E7E7', margin: 0 }}>
                    In-Depth Analysis of {decodedBook} {chapterNum}
                  </h2>
                  <button
                    onClick={() => navigator.share?.({ title: `In-Depth Analysis of ${decodedBook} ${chapterNum}`, text: `In-Depth Analysis of ${decodedBook} ${chapterNum}` }).catch(() => {})}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
                    aria-label="Share in-depth analysis"
                  >
                    <ShareIcon size={20} color="#E7E7E7" />
                  </button>
                </div>
                <CommentaryBody text={detailed.detail} />
              </div>
            ) : (
              <p className="text-[14px] py-8 text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Detailed commentary not available.
              </p>
            );
          })()
        )}
      </div>
    </div>
  );
}

/**
 * Commentary body renderer — dark theme: white text on black surface.
 */
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
        <p key={key++} style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: 16, lineHeight: '24px', color: 'rgba(255,255,255,0.87)', marginBottom: 12 }}>
          {inlineFormat(para.join(' '))}
        </p>
      );
      para = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      continue;
    }
    if (line.startsWith('###') || line.startsWith('##') || line.startsWith('#')) {
      flushPara();
      const text = line.replace(/^#+\s*/, '');
      elements.push(
        <h2 key={key++} style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 18, lineHeight: '24px', color: '#E7E7E7', marginTop: 16, marginBottom: 8 }}>
          {inlineFormat(text)}
        </h2>
      );
      continue;
    }
    if (line.startsWith('>')) {
      flushPara();
      elements.push(
        <blockquote key={key++} style={{ borderLeft: '2px solid #B09A6D', paddingLeft: 12, fontStyle: 'italic', marginBottom: 12, fontFamily: 'Roboto, sans-serif', fontSize: 16, lineHeight: '24px', color: 'rgba(255,255,255,0.6)' }}>
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

import React from 'react';

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
