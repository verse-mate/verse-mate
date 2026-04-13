import React from 'react';

interface Props {
  text: string;
}

/**
 * Lightweight markdown renderer used for the VerseMate API's explanation
 * markdown (summary, byline, detailed). Supports headings (#, ##, ###),
 * **bold**, *italic*, and > blockquotes. Kept inline to avoid pulling in a
 * full markdown dep.
 */
export default function MarkdownBlock({ text }: Props) {
  // Split text into lines and group by the "paragraph" rule: consecutive non-empty
  // lines form a paragraph, blank lines separate paragraphs. Headings and
  // blockquotes each get their own line-level element.
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      elements.push(
        <p key={key++}>{inline(para.join(' '))}</p>
      );
      para = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      elements.push(
        <blockquote
          key={key++}
          className="border-l-2 border-[#b09a6d] pl-3 italic text-current/90"
        >
          {inline(quote.join(' '))}
        </blockquote>
      );
      quote = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      flushQuote();
      continue;
    }
    if (line.startsWith('###')) {
      flushPara();
      flushQuote();
      elements.push(
        <h6 key={key++} className="text-[13px] font-semibold font-semibold mt-1">
          {inline(line.replace(/^###\s*/, ''))}
        </h6>
      );
      continue;
    }
    if (line.startsWith('##')) {
      flushPara();
      flushQuote();
      elements.push(
        <h5 key={key++} className="text-[14px] font-semibold font-semibold mt-1">
          {inline(line.replace(/^##\s*/, ''))}
        </h5>
      );
      continue;
    }
    if (line.startsWith('#')) {
      flushPara();
      flushQuote();
      elements.push(
        <h4 key={key++} className="text-[15px] font-bold font-semibold mt-1">
          {inline(line.replace(/^#\s*/, ''))}
        </h4>
      );
      continue;
    }
    if (line.startsWith('>')) {
      flushPara();
      quote.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();
    para.push(line);
  }
  flushPara();
  flushQuote();

  return (
    <div className="space-y-2 text-[13px] text-dark-fg leading-relaxed">
      {elements}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const match = m[0];
    if (match.startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {match.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(<em key={key++}>{match.slice(1, -1)}</em>);
    }
    last = m.index + match.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
