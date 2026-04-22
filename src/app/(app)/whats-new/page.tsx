import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAllNews } from '@/lib/news';

export const dynamic = 'force-dynamic';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 마크다운 문법 기호를 대략 걷어내 한 줄 요약으로
function toPlainPreview(markdown: string, max = 140) {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[>*_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

export default async function WhatsNewListPage() {
  const supabase = await createClient();
  const news = await fetchAllNews(supabase);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-100">새소식</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          일일 업무 보고 생성기의 업데이트 소식을 모아둔 공간이에요.
        </p>
      </header>

      {news.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          아직 등록된 새소식이 없어요.
        </p>
      ) : (
        <ul className="space-y-3">
          {news.map((item) => (
            <li key={item.id}>
              <Link
                href={`/whats-new/${item.id}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
              >
                <time className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  {formatDate(item.published_at)}
                </time>
                <h2 className="mt-1 text-base font-bold text-zinc-900 sm:text-lg dark:text-zinc-100">{item.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {toPlainPreview(item.content)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
