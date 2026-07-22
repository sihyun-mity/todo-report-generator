import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackLink } from '@/app/(app)/whats-new/[id]/_components';
import { NewsAudienceBadge, NewsMarkdown } from '@/components';
import { fetchNewsById, getViewerUserId } from '@/lib/news';
import { createClient } from '@/lib/supabase/server';
import { staticMetadata } from '@/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/whats-new/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const item = await fetchNewsById(supabase, id, !!(await getViewerUserId(supabase)));

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

export default async function NewsDetailPage({ params }: PageProps<'/whats-new/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();
  // 대상이 맞지 않는 소식은 조회되지 않는다 — 목록에 없는 소식의 URL 직접 접근도 404 로 막힌다.
  const item = await fetchNewsById(supabase, id, !!(await getViewerUserId(supabase)));

  if (!item) notFound();

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <BackLink />

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
    </main>
  );
}
