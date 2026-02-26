'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useState, useMemo, useCallback } from 'react';

interface MarkdownRendererProps {
  content: string;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as React.ReactElement).props.children);
  }
  return '';
}

function extractHeadings(markdown: string): HeadingItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: HeadingItem[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push({
      id: slugify(match[2]),
      text: match[2].replace(/`/g, ''),
      level: match[1].length,
    });
  }
  return headings;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [tocOpen, setTocOpen] = useState(false);
  const headings = useMemo(() => extractHeadings(content), [content]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  const handleTocClick = useCallback(() => setTocOpen(false), []);

  return (
    <div>
      {/* Table of Contents */}
      <div className="mb-6">
        <button
          onClick={() => setTocOpen(!tocOpen)}
          className="text-xs text-gray-400 hover:text-gray-600 uppercase tracking-wider font-medium flex items-center gap-1.5"
        >
          <span className="text-[10px]">{tocOpen ? '▼' : '▶'}</span>
          Table of Contents
        </button>
        {tocOpen && (
          <nav className="mt-3 pl-2 border-l-2 border-gray-100 space-y-1 max-h-[50vh] overflow-y-auto">
            {headings.map(({ id, text, level }) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={handleTocClick}
                className={`block text-xs leading-relaxed transition-colors ${
                  level === 3 ? 'pl-4' : ''
                } ${
                  activeId === id
                    ? 'text-pink-500 font-medium'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {text}
              </a>
            ))}
          </nav>
        )}
      </div>

      {/* Rendered markdown */}
      <article className="prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children, ...props }) => {
              const text = extractTextFromChildren(children);
              const id = slugify(text);
              return (
                <h1 id={id} className="scroll-mt-20" {...props}>
                  <a href={`#${id}`} className="no-underline text-inherit hover:text-pink-500">
                    {children}
                  </a>
                </h1>
              );
            },
            h2: ({ children, ...props }) => {
              const text = extractTextFromChildren(children);
              const id = slugify(text);
              return (
                <h2 id={id} className="scroll-mt-20" {...props}>
                  <a href={`#${id}`} className="no-underline text-inherit hover:text-pink-500">
                    {children}
                  </a>
                </h2>
              );
            },
            h3: ({ children, ...props }) => {
              const text = extractTextFromChildren(children);
              const id = slugify(text);
              return (
                <h3 id={id} className="scroll-mt-20" {...props}>
                  <a href={`#${id}`} className="no-underline text-inherit hover:text-pink-500">
                    {children}
                  </a>
                </h3>
              );
            },
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                target={href?.startsWith('http') ? '_blank' : undefined}
                rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                {...props}
              >
                {children}
              </a>
            ),
            table: ({ children, ...props }) => (
              <div className="overflow-x-auto -mx-3 px-3">
                <table {...props}>{children}</table>
              </div>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
