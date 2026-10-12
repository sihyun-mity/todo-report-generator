import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { BackLink } from '@/app/(app)/whats-new/[id]/_components';
import { NewsAudienceBadge, NewsMarkdown } from '@/components';
import { fetchNewsById, getViewerUserId } from '@/lib/news';
import { createClient } from '@/lib/supabase/server';
import { staticMetadata } from '@/utils';

// generateMetadata 와 본문이 같은 요청 안에서 각각 세션 확인(auth.getUser) + 소식 조회를 하지 않도록
// 요청 단위로 결과를 공유한다.
// 대상이 맞지 않는 소식은 조회되지 않는다 — 목록에 없는 소식의 URL 직접 접근도 404 로 막힌다.
const getVisibleNews = cache(async (id: string) => {
  const supabase = await createClient();
  return fetchNewsById(supabase, id, !!(await getViewerUserId(supabase)));
});

export async function generateMetadata({ params }: PageProps<'/whats-new/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const item = await getVisibleNews(id);

  return staticMetadata({
    title: item?.title ?? '새소식',
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function NewsDetailPage({ params }: PageProps<'/whats-new/[id]'>) {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <BackLink />

      {/* id(params)와 조회자 대상(세션 쿠키)이 모두 요청 시점 값이라 본문은 스트리밍한다 */}
      <Suspense fallback={<NewsArticleSkeleton />}>
        <NewsArticle params={params} />
      </Suspense>
    </main>
  );
}

async function NewsArticle({ params }: Pick<PageProps<'/whats-new/[id]'>, 'params'>) {
  const { id } = await params;
  const item = await getVisibleNews(id);

  if (!item) notFound();

  return (
    <article className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <time className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          {formatDate(item.published_at)}
        </time>
        <NewsAudienceBadge audience={item.audience} />
      </div>
      <h1 className="mt-1 text-2xl leading-tight font-bold text-zinc-900 sm:text-3xl dark:text-zinc-100">
        {item.title}
      </h1>

      <div className="mt-6">
        <NewsMarkdown content={item.content} />
      </div>
    </article>
  );
}

function NewsArticleSkeleton() {
  return (
    <div className="mt-6 animate-pulse" aria-hidden>
      <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-8 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-6 space-y-2.5">
        <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
      </div>
    </div>
  );
}
