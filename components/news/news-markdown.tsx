'use client';

import ReactMarkdown from 'react-markdown';

type Props = {
  content: string;
};

// 새소식 공용 마크다운 렌더러 — @tailwindcss/typography 없이도 보기 좋게 표시
export function NewsMarkdown({ content }: Readonly<Props>) {
  return (
    <div className="text-sm text-zinc-600 dark:text-zinc-300">
      <ReactMarkdown
        components={{
          h1: (props) => <h1 className="mt-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100" {...props} />,
          h2: (props) => <h2 className="mt-6 text-lg font-semibold text-zinc-900 dark:text-zinc-100" {...props} />,
          h3: (props) => <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100" {...props} />,
          p: (props) => <p className="mt-3 leading-relaxed" {...props} />,
          ul: (props) => <ul className="mt-3 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mt-3 list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li {...props} />,
          a: (props) => (
            <a className="text-blue-500 underline hover:text-blue-600" target="_blank" rel="noreferrer" {...props} />
          ),
          strong: (props) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100" {...props} />,
          code: (props) => <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="mt-3 border-l-4 border-zinc-200 pl-4 text-zinc-600 italic dark:border-zinc-700 dark:text-zinc-400"
              {...props}
            />
          ),
          hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-800" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
