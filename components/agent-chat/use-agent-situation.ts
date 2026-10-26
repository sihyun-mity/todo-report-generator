'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentRequestScope, News, Project } from '@/types';
import { AGENT_PAGES, AGENT_SITUATION_NEWS_STALE_MS } from '@/constants';
import { queries } from '@/providers';
import { useAgentChatStore, useReportFormStore, useReportHistoryStore } from '@/stores';
import { newsIdFromPath } from '@/utils';
import { useTheme } from '..';

type NewsList = { isMember: boolean; items: Array<News> };

const SECTION_LABELS: Record<string, string> = { today: '금일', tomorrow: '익일', 금일: '금일', 익일: '익일' };

const screenOf = (path: string, newsTitle: string | null) => {
  if (newsIdFromPath(path)) return `새소식 상세${newsTitle ? ` — '${newsTitle}'` : ''}`;
  const page = Object.values(AGENT_PAGES).find((p) => p.path === path);
  return page ? page.label : path;
};

// 한 구역을 한 줄로 — 프로젝트·작업 수와 완료(100%) 수. 빈 줄은 세지 않는다
const sectionSummary = (projects: ReadonlyArray<Project>) => {
  const filled = projects.filter((p) => p.name.trim() !== '' || p.tasks.some((t) => t.content.trim() !== ''));
  const tasks = filled.flatMap((p) => p.tasks.filter((t) => t.content.trim() !== ''));
  if (tasks.length === 0) return 'empty';
  const done = tasks.filter((t) => t.progress === 100).length;
  return `${filled.length} projects (${filled.map((p) => p.name.trim() || '이름 없음').join(', ')}), ${tasks.length} tasks, ${done} done (100%)`;
};

// Nano가 매 요청 처음부터 알아야 하는 지금 상황 — 어느 화면인지, 회원인지, 작성 중인 보고서·저장 기록·새소식이 있는지.
// 예전에는 의도를 고르는 첫 단계에 도구 제목만 넘겨, 이런 것을 모른 채 판단했다(새소식 요청을 화면 모드로 고르는 등).
// 도구를 불러야 알던 것을 짧게 요약해 넘긴다 — 컨텍스트 창이 작아(9,216 토큰) 개수·이름만 담고 본문은 도구로 읽게 한다.
export function useAgentSituation() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const latest = useRef(theme);
  useEffect(() => {
    latest.current = theme;
  });

  return async (scope: AgentRequestScope): Promise<Record<string, unknown>> => {
    // 기록 store 의 모드가 곧 회원 여부다(게스트 쿠키면 Supabase 를 부르지 않는다) — 홈이 아닌 화면에서는 아직 적재 전일 수 있다
    await useReportHistoryStore
      .getState()
      .initialize()
      .catch(() => undefined);
    const { mode, allReportDates } = useReportHistoryStore.getState();
    const { reportDate, today, tomorrow } = useReportFormStore.getState();
    const news = await queryClient
      .fetchQuery({ ...queries.news.list(), staleTime: AGENT_SITUATION_NEWS_STALE_MS })
      .then((data: NewsList) => data.items)
      .catch(() => null);
    const titleOf = (id: string | null) =>
      id
        ? (queryClient.getQueryData<News | null>(queries.news.detail(id).queryKey)?.title ??
          news?.find((n) => n.id === id)?.title ??
          null)
        : null;
    const { lastNewsId, focus } = useAgentChatStore.getState();
    // 대화에서 다루고 있는 대상 — "그거·그날·그 작업"을 풀 때 쓴다(latest 가 가장 최근에 다룬 종류)
    const talkingAbout = {
      ...(focus.latest ? { latest: focus.latest } : {}),
      ...(focus.subject ? { lastRequestAbout: focus.subject } : {}),
      ...(focus.news ? { news: `'${focus.news.title}'` } : {}),
      ...(focus.reportDate ? { report: focus.reportDate } : {}),
      ...(focus.task
        ? {
            task: [SECTION_LABELS[focus.task.section ?? ''], focus.task.project, focus.task.task]
              .filter(Boolean)
              .join(' · '),
          }
        : {}),
    };

    return {
      screen: screenOf(scope.path, titleOf(newsIdFromPath(scope.path))),
      user:
        mode === 'user'
          ? 'member (logged in; reports are saved in the account)'
          : mode === 'guest'
            ? 'guest (not logged in; reports are saved only in this browser; logging in is optional)'
            : 'unknown',
      colorTheme: latest.current,
      reportForm: {
        note: 'the report being written on the home screen (보고서 작성), not saved yet',
        date: `${reportDate.month}/${reportDate.day}`,
        today: sectionSummary(today),
        tomorrow: sectionSummary(tomorrow),
      },
      savedReports:
        mode === 'loading'
          ? 'unknown'
          : allReportDates.length === 0
            ? 'none'
            : { count: allReportDates.length, newest: allReportDates[0], oldest: allReportDates.at(-1) },
      news: news ? { count: news.length, newest: news[0]?.title ?? null } : 'unknown',
      ...(lastNewsId && lastNewsId !== newsIdFromPath(scope.path) ? { lastViewedNews: titleOf(lastNewsId) } : {}),
      ...(Object.keys(talkingAbout).length > 0 ? { talkingAbout } : {}),
    };
  };
}
