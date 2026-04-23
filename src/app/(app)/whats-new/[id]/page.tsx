import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { NewsMarkdown } from '@/components';
import { fetchNewsById } from '@/lib/news';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
  const item = await fetchNewsById(supabase, id);

  if (!item) notFound();

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/whats-new"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        <ChevronLeft className="h-4 w-4" />
        새소식 목록
      </Link>

      <article className="mt-6">
        <time className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          {formatDate(item.published_at)}
        </time>
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
