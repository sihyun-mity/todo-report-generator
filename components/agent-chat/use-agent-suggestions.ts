'use client';

import { useSyncExternalStore } from 'react';
import type { AgentQuickAction, AgentSuggestion } from '@/types';
import { AGENT_SUGGESTION_LIMIT } from '@/constants';
import { useAgentChatStore, useAgentToolsStore, useReportFormStore, useReportHistoryStore } from '@/stores';
import { hasProjectContent, toDateKey } from '@/utils';
import { useTheme } from '..';

// 시계 — 요일·시각에 따른 제안용. 서버 프리렌더에서는 null(지금 시각을 셸에 굳히지 않는다), 클라이언트는 1분마다 다시 읽는다.
const subscribeMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
};
const readClock = () => {
  const now = new Date();
  return { year: now.getFullYear(), weekday: now.getDay(), hour: now.getHours() };
};
let clockCache: ReturnType<typeof readClock> | null = null;
const getClock = () => {
  const next = readClock();
  // useSyncExternalStore 는 같은 값이면 같은 참조를 돌려줘야 한다
  if (!clockCache || clockCache.weekday !== next.weekday || clockCache.hour !== next.hour) clockCache = next;
  return clockCache;
};
const getServerClock = () => null;

// 서비스 에이전트의 "다음 할 일" — 지금 화면·폼 상태·시각을 보고 고른 상황 제안과, 이 화면에서 바로 할 수 있는 빠른 작업.
// 모델을 쓰지 않는 규칙이라 AI 가 없는 브라우저에서도 동작한다(AI 가 필요한 항목만 needsAi 로 거른다).
// 권하는 일은 지금 레지스트리에 도구가 있는 것만 — 다른 화면의 기능을 권하지 않는다.
export function useAgentSuggestions(): {
  suggestions: ReadonlyArray<AgentSuggestion>;
  quickActions: ReadonlyArray<AgentQuickAction>;
} {
  const clock = useSyncExternalStore(subscribeMinute, getClock, getServerClock);
  const { theme } = useTheme();
  const tools = useAgentToolsStore((s) => s.tools);
  const availability = useAgentChatStore((s) => s.availability);
  const pathname = useAgentChatStore((s) => s.pathname);
  const dismissed = useAgentChatStore((s) => s.dismissed);
  const reportDate = useReportFormStore((s) => s.reportDate);
  const today = useReportFormStore((s) => s.today);
  const tomorrow = useReportFormStore((s) => s.tomorrow);
  const mode = useReportHistoryStore((s) => s.mode);
  const allReportDates = useReportHistoryStore((s) => s.allReportDates);

  const has = (name: string) => tools.some((t) => t.name === name);
  const aiReady = availability === 'available';
  const onReport = has('get_current_report');
  const todayFilled = today.some(hasProjectContent);
  const tomorrowFilled = tomorrow.some(hasProjectContent);
  const incomplete = today.flatMap((p) => p.tasks).filter((t) => t.content.trim() !== '' && t.progress < 100).length;
  const isSaved =
    clock !== null &&
    allReportDates.includes(toDateKey(clock.year, parseInt(reportDate.month, 10), parseInt(reportDate.day, 10)));
  const isNight = clock !== null && (clock.hour >= 19 || clock.hour < 6);
  // 같은 프로젝트 안에 같은 내용 작업이 둘 이상 — 덧붙이기를 여러 번 하면 생긴다
  const duplicates = [...today, ...tomorrow].reduce((count, p) => {
    const contents = p.tasks.map((t) => t.content.trim()).filter((c) => c !== '');
    return count + contents.length - new Set(contents).size;
  }, 0);

  const all: Array<AgentSuggestion> = [];
  if (onReport) {
    // 가장 많이 쓰는 기능 — 오늘 업무가 비어 있으면 맨 앞에 권한다. 게스트에게도 보여 준다(열면 로그인 안내가 뜬다).
    if (has('open_github_import') && !todayFilled)
      all.push({
        id: 'github',
        title: 'GitHub 커밋으로 오늘 업무 채우기',
        reason:
          mode === 'user'
            ? '클릭 한 번으로 커밋을 불러와 프로젝트·작업으로 정리해요'
            : '로그인하면 커밋을 불러와 프로젝트·작업으로 정리해 드려요',
        action: { type: 'tool', tool: 'open_github_import', title: 'GitHub 커밋 가져오기 열기' },
        needsAi: false,
        emphasis: true,
      });
    if (has('carry_over_incomplete_tasks') && incomplete > 0 && !tomorrowFilled)
      all.push({
        id: 'carry-over',
        title: '미완료 업무를 내일 할 일로 옮기기',
        reason: `진행 중인 작업이 ${incomplete}개 있어요`,
        action: { type: 'tool', tool: 'carry_over_incomplete_tasks', title: '미완료 업무 익일로 가져오기' },
        needsAi: false,
      });
    if (has('remove_duplicate_tasks') && duplicates > 0)
      all.push({
        id: 'duplicates',
        title: '중복된 작업 정리하기',
        reason: `같은 작업이 ${duplicates}개 더 있어요 — 하나로 합쳐 드려요`,
        action: { type: 'tool', tool: 'remove_duplicate_tasks', title: '중복 작업 정리' },
        needsAi: false,
      });
    if (has('fill_report') && !todayFilled)
      all.push({
        id: 'notes',
        title: '오늘 한 일 적어서 보고서 쓰기',
        reason: '입력창에 편하게 적으면 보고서로 정리해 드려요',
        action: { type: 'notes' },
        needsAi: true,
      });
    if (has('save_report') && todayFilled && clock !== null && !isSaved)
      all.push({
        id: `save-${reportDate.month}-${reportDate.day}`,
        title: '작성 중인 보고서 저장하기',
        reason: '이 날짜 보고서를 아직 저장하지 않았어요',
        action: { type: 'tool', tool: 'save_report', title: '보고서 기록에 저장' },
        needsAi: false,
      });
    if (has('search_reports') && clock?.weekday === 5)
      all.push({
        id: 'weekly',
        title: '이번 주 보고서 정리하기',
        reason: '금요일이에요 — 한 주를 정리해 보세요',
        action: { type: 'prompt', text: '이번 주에 쓴 보고서를 정리해줘', fresh: true },
        needsAi: true,
      });
    if (has('search_reports') && clock?.weekday === 1)
      all.push({
        id: 'last-week',
        title: '지난주 보고서 돌아보기',
        reason: '월요일이에요 — 지난주에 한 일을 요약해 드려요',
        action: { type: 'prompt', text: '지난주 보고서 요약해줘', fresh: true },
        needsAi: true,
      });
  }
  if (pathname === '/whats-new' && has('list_news'))
    all.push({
      id: 'news-summary',
      title: '최근 새소식 요약 보기',
      reason: '최근 업데이트를 짧게 정리해 드려요',
      action: { type: 'prompt', text: '최근 새소식 3개를 요약해줘', fresh: true },
      needsAi: true,
    });
  if (pathname.startsWith('/whats-new/') && has('get_news'))
    all.push({
      id: `news-${pathname}`,
      title: '이 소식 요약하기',
      reason: '긴 소식을 몇 줄로 줄여 드려요',
      action: { type: 'prompt', text: '지금 보고 있는 새소식을 요약해줘', fresh: true },
      needsAi: true,
    });
  if (pathname === '/settings' && has('navigate'))
    all.push({
      id: 'notifications',
      title: '작성 알림 설정 보기',
      reason: '평일 오후 4시에 보고서를 쓰지 않았으면 알려 드려요',
      action: { type: 'tool', tool: 'navigate', title: '화면 이동', input: { page: 'settings_notifications' } },
      needsAi: false,
    });
  if (has('set_theme') && isNight && theme === 'light')
    all.push({
      id: 'night-theme',
      title: '다크 모드로 바꾸기',
      reason: '밤이에요 — 눈이 편한 어두운 화면으로 바꿔 보세요',
      action: { type: 'tool', tool: 'set_theme', title: '화면 모드 바꾸기', input: { theme: 'dark' } },
      needsAi: false,
    });

  const suggestions = all
    .filter((s) => (aiReady || !s.needsAi) && !dismissed.has(s.id))
    .slice(0, AGENT_SUGGESTION_LIMIT);

  const quickActions: Array<AgentQuickAction> = [];
  const quick = (id: string, label: string, action: AgentQuickAction['action'], needsAi = false, emphasis = false) => {
    if (aiReady || !needsAi) quickActions.push({ id, label, action, needsAi, emphasis });
  };
  if (onReport) {
    // GitHub 가져오기는 늘 첫 번째·강조
    if (has('open_github_import'))
      quick(
        'github',
        'GitHub에서 가져오기',
        { type: 'tool', tool: 'open_github_import', title: 'GitHub 커밋 가져오기 열기' },
        false,
        true
      );
    if (has('carry_over_incomplete_tasks'))
      quick('carry', '미완료 → 내일', {
        type: 'tool',
        tool: 'carry_over_incomplete_tasks',
        title: '미완료 업무 익일로 가져오기',
      });
    if (has('save_report')) quick('save', '저장', { type: 'tool', tool: 'save_report', title: '보고서 기록에 저장' });
    if (has('search_reports'))
      quick('weekly', '이번 주 정리', { type: 'prompt', text: '이번 주에 쓴 보고서를 정리해줘', fresh: true }, true);
    if (has('export_reports'))
      quick('export', '기록 내보내기', { type: 'tool', tool: 'export_reports', title: '보고서 기록 내보내기' });
  }
  if (has('navigate') && pathname !== '/')
    quick('home', '보고서 작성으로', {
      type: 'tool',
      tool: 'navigate',
      title: '화면 이동',
      input: { page: 'home' },
    });
  if (has('navigate') && pathname !== '/whats-new')
    quick('news', '새소식', { type: 'tool', tool: 'navigate', title: '화면 이동', input: { page: 'whats_new' } });
  if (has('set_theme')) {
    const next = theme === 'light' ? 'dark' : 'light';
    quick('theme', next === 'dark' ? '다크 모드' : '라이트 모드', {
      type: 'tool',
      tool: 'set_theme',
      title: '화면 모드 바꾸기',
      input: { theme: next },
    });
  }

  return { suggestions, quickActions };
}
