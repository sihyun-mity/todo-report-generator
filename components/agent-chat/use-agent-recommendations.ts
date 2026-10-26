'use client';

import { useState } from 'react';
import type { AgentRecommendation } from '@/types';
import { AGENT_RECOMMENDATION_LIMIT } from '@/constants';
import { useReportFormStore, useReportHistoryStore } from '@/stores';
import { hasProjectContent, toDateKey } from '@/utils';

// 지금 상태를 보고 먼저 권할 일을 고른다 — 빈 대화의 첫 화면에 "추천"으로 보여 준다.
// 권하는 일은 지금 화면에 도구가 있는 것만(다른 화면 기능을 권하지 않는다). 계산은 렌더마다 store 를 읽어 한다.
export function useAgentRecommendations(
  toolNames: ReadonlyArray<string>,
  canWriteFromNotes: boolean
): ReadonlyArray<AgentRecommendation> {
  // 패널을 연 시점 기준 — 렌더마다 new Date() 를 부르지 않게 처음 한 번만 잰다(폼처럼 연도는 올해로 본다)
  const [now] = useState(() => new Date());
  const weekday = now.getDay();
  const reportDate = useReportFormStore((s) => s.reportDate);
  const today = useReportFormStore((s) => s.today);
  const tomorrow = useReportFormStore((s) => s.tomorrow);
  const mode = useReportHistoryStore((s) => s.mode);
  const allReportDates = useReportHistoryStore((s) => s.allReportDates);
  const has = (name: string) => toolNames.includes(name);

  const result: Array<AgentRecommendation> = [];
  const todayFilled = today.some(hasProjectContent);
  const tomorrowFilled = tomorrow.some(hasProjectContent);
  const incomplete = today.flatMap((p) => p.tasks).filter((t) => t.content.trim() !== '' && t.progress < 100).length;
  const currentKey = toDateKey(now.getFullYear(), parseInt(reportDate.month, 10), parseInt(reportDate.day, 10));

  if (canWriteFromNotes && !todayFilled)
    result.push({
      action: 'notes',
      text: '메모로 오늘 보고서 쓰기',
      reason: '오늘 한 일을 편하게 적으면 보고서로 정리해 드려요',
    });
  if (has('open_github_import') && mode === 'user' && !todayFilled)
    result.push({
      action: 'send',
      text: 'GitHub 커밋 가져오기 열어줘',
      reason: '커밋으로 오늘 한 일을 채울 수 있어요',
    });
  if (has('carry_over_incomplete_tasks') && incomplete > 0 && !tomorrowFilled)
    result.push({
      action: 'send',
      text: '오늘 미완료 업무를 내일 할 일로 옮겨줘',
      reason: `진행 중인 작업이 ${incomplete}개 있어요`,
    });
  if (has('save_report') && todayFilled && !allReportDates.includes(currentKey))
    result.push({
      action: 'send',
      text: '작성 중인 보고서를 저장해줘',
      reason: '이 날짜 보고서를 아직 저장하지 않았어요',
    });
  if (has('search_reports') && weekday === 5)
    result.push({
      action: 'send',
      text: '이번 주에 쓴 보고서를 정리해줘',
      reason: '금요일이에요 — 한 주를 정리해 보세요',
    });
  if (has('search_reports') && weekday === 1)
    result.push({ action: 'send', text: '지난주 보고서 요약해줘', reason: '월요일이에요 — 지난주를 돌아보세요' });

  return result.slice(0, AGENT_RECOMMENDATION_LIMIT);
}
