import type { Metadata } from 'next';
import { Suspense } from 'react';
import { fetchAllNews, getViewerUserId } from '@/lib/news';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { NewsAudienceBadge } from '@/components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '새소식',
  description: '일일 업무 보고 생성기의 업데이트 소식을 모아둔 공간이에요.',
});

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

export default function WhatsNewListPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-100">새소식</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          일일 업무 보고 생성기의 업데이트 소식을 모아둔 공간이에요.
        </p>
      </header>

      {/* 조회자(회원/비회원)에 따라 목록이 달라 세션 쿠키를 읽어야 하므로 요청 시점에 스트리밍한다 */}
      <Suspense fallback={<NewsListSkeleton />}>
        <NewsList />
      </Suspense>
    </main>
  );
}

async function NewsList() {
  const supabase = await createClient();
  // 로그인 여부에 따라 보이는 소식이 달라진다 — 회원은 `모두`+`회원 전용`, 비회원은 `모두`+`비회원 전용`.
  const userId = await getViewerUserId(supabase);
  const isMember = !!userId;
  const news = await fetchAllNews(supabase, isMember);

  return (
    <>
      {!isMember && (
        <p className="-mt-5 mb-8 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          지금은 비회원에게 해당하는 소식만 보이고 있어요.{' '}
          <Link href="/login" className="font-semibold text-blue-500 transition hover:text-blue-600">
            로그인
          </Link>
          하면 회원 전용 소식도 함께 볼 수 있어요.
        </p>
      )}

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
                <div className="flex flex-wrap items-center gap-2">
                  <time className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    {formatDate(item.published_at)}
                  </time>
                  <NewsAudienceBadge audience={item.audience} />
                </div>
                <h2 className="mt-1 text-base font-bold text-zinc-900 sm:text-lg dark:text-zinc-100">{item.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {toPlainPreview(item.content)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// 목록 카드와 같은 외곽/패딩(p-5)·행 구성(날짜 → 제목 → 2줄 미리보기)을 따라 스트리밍 전후 레이아웃 점프를 줄인다.
function NewsListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, idx) => (
        <li
          key={idx}
          className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-2 h-5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-3 h-3.5 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-2 h-3.5 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
        </li>
      ))}
    </ul>
  );
}
