'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, X } from 'lucide-react';
import { Portal } from '@/components';
import { createClient } from '@/lib/supabase/client';
import NewsMarkdown from './NewsMarkdown';
import type { News } from '@/types/news';

interface Props {
  /** 서버에서 내려준 최신 새소식 (없으면 다이얼로그는 뜨지 않음) */
  latestNews: News | null;
  /** 로그인한 유저의 id. 게스트라면 null */
  userId: string | null;
  /** 로그인 유저 기준, 서버에서 이미 읽음 여부를 판단해 내려줌 */
  alreadyReadByUser: boolean;
}

const GUEST_STORAGE_KEY = 'trg:last-seen-news-id';

export default function NewsDialog({ latestNews, userId, alreadyReadByUser }: Props) {
  const [open, setOpen] = useState(false);

  // 표시 여부: 로그인 유저는 DB 기준, 게스트는 localStorage 기준.
  // localStorage는 SSR에서 읽을 수 없어 클라이언트 마운트 후에만 확정 가능.
  useEffect(() => {
    if (!latestNews) return;

    let shouldOpen: boolean;
    if (userId) {
      shouldOpen = !alreadyReadByUser;
    } else {
      try {
        shouldOpen = window.localStorage.getItem(GUEST_STORAGE_KEY) !== latestNews.id;
      } catch {
        shouldOpen = true;
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (shouldOpen) setOpen(true);
  }, [latestNews, userId, alreadyReadByUser]);

  const markReadAndClose = useCallback(async () => {
    setOpen(false);
    if (!latestNews) return;

    if (userId) {
      try {
        const supabase = createClient();
        await supabase.from('user_news_reads').upsert(
          {
            user_id: userId,
            news_id: latestNews.id,
            read_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,news_id' }
        );
      } catch (e) {
        console.error('[NewsDialog] mark read failed', e);
      }
    } else {
      try {
        window.localStorage.setItem(GUEST_STORAGE_KEY, latestNews.id);
      } catch {
        // ignore
      }
    }
  }, [latestNews, userId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void markReadAndClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, markReadAndClose]);

  if (!open || !latestNews) return null;

  const formattedDate = new Date(latestNews.published_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
        onClick={() => void markReadAndClose()}
      >
        <div
          className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold tracking-wide text-blue-500 uppercase">새소식</div>
                <h2
                  id="news-dialog-title"
                  className="mt-0.5 text-base font-bold text-zinc-900 sm:text-lg dark:text-zinc-100"
                >
                  {latestNews.title}
                </h2>
                <time className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{formattedDate}</time>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void markReadAndClose()}
              aria-label="닫기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
            <NewsMarkdown content={latestNews.content} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
            <Link
              href="/whats-new"
              onClick={() => void markReadAndClose()}
              className="text-sm font-medium text-blue-500 transition hover:text-blue-600"
            >
              이전 소식 모두 보기 →
            </Link>
            <button
              type="button"
              onClick={() => void markReadAndClose()}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
