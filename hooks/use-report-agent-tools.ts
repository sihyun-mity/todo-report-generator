import { useEffect, useEffectEvent } from 'react';
import toast from 'react-hot-toast';
import type { Project, ProjectsBucket, ReportDate, ReportHistoryItem, WebMcpJsonSchema, WebMcpTool } from '@/types';
import { confirm, useReportFormStore, useReportHistoryStore } from '@/stores';
import { registerWebMcpTools, toolError, toolText } from '@/lib/webmcp';
import {
  areAllAttemptedProjectsValid,
  createEmptyProject,
  createId,
  generateReportText,
  hasProjectContent,
  isProjectEmpty,
  mergeIncompleteTasks,
  parseReportText,
  reportItemDateKey,
} from '@/utils';

// 검색 결과로 돌려줄 최대 보고서 수 — 에이전트 컨텍스트를 한 번에 넘치게 하지 않을 정도.
const MAX_SEARCH_RESULTS = 62;

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ───────────── 에이전트에게 보여주는 형태 ─────────────
// 내부 id 는 빼고 내용만 넘긴다. 쓰기 도구는 버킷 단위로 통째로 받으므로 id 로 항목을 가리킬 일이 없다.

type AgentTask = { content: string; progress: number; details: Array<string> };
type AgentProject = { name: string; tasks: Array<AgentTask> };

const toAgentProjects = (projects: ReadonlyArray<Project>): Array<AgentProject> =>
  projects.filter(hasProjectContent).map((p) => ({
    name: p.name,
    tasks: p.tasks
      .filter((t) => t.content.trim() !== '')
      .map((t) => ({
        content: t.content,
        progress: t.progress,
        details: t.details.map((d) => d.content).filter((c) => c.trim() !== ''),
      })),
  }));

const toAgentReport = (item: ReportHistoryItem) => ({
  date: reportItemDateKey(item),
  today: toAgentProjects(item.todayProjects),
  tomorrow: toAgentProjects(item.tomorrowProjects),
});

const isSavable = (today: ReadonlyArray<Project>, tomorrow: ReadonlyArray<Project>) =>
  (today.some(hasProjectContent) || tomorrow.some(hasProjectContent)) &&
  areAllAttemptedProjectsValid(today) &&
  areAllAttemptedProjectsValid(tomorrow);

const currentFormSnapshot = () => {
  const { reportDate, today, tomorrow } = useReportFormStore.getState();
  return {
    month: Number(reportDate.month),
    day: Number(reportDate.day),
    today: toAgentProjects(today),
    tomorrow: toAgentProjects(tomorrow),
    canSave: isSavable(today, tomorrow),
    text: generateReportText({ ...reportDate, todayProjects: today, tomorrowProjects: tomorrow }),
  };
};

// ───────────── 입력 검증 ─────────────
// inputSchema 는 에이전트에게 주는 힌트일 뿐 브라우저가 강제하지 않는다. execute 에서 다시 검증한다.
// 실패하면 에이전트가 고쳐 다시 부를 수 있도록 어느 필드가 왜 틀렸는지 문자열로 돌려준다.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseProjectsInput = (value: unknown, field: string): Array<Project> | string => {
  if (!Array.isArray(value)) return `${field} 는 프로젝트 배열이어야 합니다.`;
  const projects: Array<Project> = [];
  for (const [pi, raw] of value.entries()) {
    const at = `${field}[${pi}]`;
    if (!isRecord(raw)) return `${at} 는 객체여야 합니다.`;
    if (typeof raw.name !== 'string' || raw.name.trim() === '')
      return `${at}.name 은 비어 있지 않은 문자열이어야 합니다.`;
    if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) return `${at}.tasks 에 작업이 1개 이상 필요합니다.`;

    const tasks: Project['tasks'] = [];
    for (const [ti, task] of raw.tasks.entries()) {
      const tat = `${at}.tasks[${ti}]`;
      if (!isRecord(task)) return `${tat} 는 객체여야 합니다.`;
      if (typeof task.content !== 'string' || task.content.trim() === '')
        return `${tat}.content 는 비어 있지 않은 문자열이어야 합니다.`;
      const progress = task.progress ?? 0;
      if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100)
        return `${tat}.progress 는 0~100 정수여야 합니다.`;
      const details = task.details ?? [];
      if (!Array.isArray(details) || details.some((d) => typeof d !== 'string'))
        return `${tat}.details 는 문자열 배열이어야 합니다.`;
      tasks.push({
        id: createId(),
        content: task.content.trim(),
        progress,
        details: (details as Array<string>)
          .map((d) => d.trim())
          .filter((d) => d !== '')
          .map((content) => ({ id: createId(), content })),
      });
    }
    projects.push({ id: createId(), name: raw.name.trim(), tasks });
  }
  return projects;
};

const parseDateKeyInput = (value: unknown, field: string): string | { error: string } => {
  if (typeof value !== 'string' || !DATE_KEY_REGEX.test(value))
    return { error: `${field} 는 YYYY-MM-DD 형식이어야 합니다.` };
  return value;
};

// 빈 배열로 교체하면 폼에 입력칸이 하나도 없는 상태가 되므로 초기값(빈 프로젝트 1개)으로 둔다.
const orInitial = (projects: Array<Project>) => (projects.length > 0 ? projects : [createEmptyProject()]);

// append 모드: 같은 이름의 프로젝트에는 작업만 덧붙이고, 나머지는 뒤에 추가한다.
// 버킷이 초기값(빈 프로젝트만 있음)이면 그대로 교체한다.
const appendProjects = (prev: ReadonlyArray<Project>, next: ReadonlyArray<Project>): Array<Project> => {
  if (prev.every(isProjectEmpty)) return orInitial([...next]);
  const merged = [...prev];
  for (const project of next) {
    const index = merged.findIndex((p) => p.name.trim() === project.name);
    if (index > -1) merged[index] = { ...merged[index], tasks: [...merged[index].tasks, ...project.tasks] };
    else merged.push(project);
  }
  return merged;
};

// ───────────── 스키마 ─────────────

const PROJECTS_SCHEMA: WebMcpJsonSchema = {
  type: 'array',
  description: '프로젝트(대분류) 목록. 각 프로젝트는 작업(중분류)을 1개 이상 가진다.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '프로젝트명' },
      tasks: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '작업 내용 (한 줄)' },
            progress: { type: 'integer', minimum: 0, maximum: 100, description: '진행률(%). 생략하면 0' },
            details: {
              type: 'array',
              items: { type: 'string' },
              description: '세부 항목(소분류) 문장 목록. 진행률은 없다.',
            },
          },
          required: ['content'],
        },
      },
    },
    required: ['name', 'tasks'],
  },
};

const DATE_KEY_SCHEMA: WebMcpJsonSchema = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: '보고서 날짜 (YYYY-MM-DD)',
};

type Options = {
  // 폼이 기록 hydration 까지 끝나 편집 가능한 상태일 때만 도구를 노출한다.
  // 그 전에 채우면 hydration(오늘 기록 복원 / 익일 carry-over)이 에이전트 입력을 덮어쓴다.
  enabled: boolean;
  // save_report 로 기록에 저장된 직후 — 이탈 경고 baseline 갱신, 캘린더 이동 등 폼 쪽 후처리.
  onSaved: (date: ReportDate) => void;
};

// 보고서 작성 화면의 기능을 WebMCP 도구로 노출한다.
// 도구는 DOM 을 거치지 않고 store 액션을 직접 호출하므로, 에이전트의 변경도 사용자 입력과 똑같이 화면에 반영된다.
// WebMCP 를 지원하지 않는 브라우저에서는 아무 일도 하지 않는다.
export const useReportAgentTools = ({ enabled, onSaved }: Readonly<Options>) => {
  const handleSaved = useEffectEvent(onSaved);

  useEffect(() => {
    if (!enabled) return;

    const tools: Array<WebMcpTool> = [
      {
        name: 'get_current_report',
        description:
          '현재 작성 중인 일일 업무 보고서 폼의 내용을 돌려준다. 보고서 날짜(month/day), 금일 업무(today), 익일 업무(tomorrow), 저장 가능 여부(canSave), 완성된 보고서 텍스트(text)를 포함한다. 폼을 수정하기 전에 먼저 호출해 현재 상태를 확인한다.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolText(currentFormSnapshot()),
      },
      {
        name: 'list_report_dates',
        description:
          '사용자가 이전에 저장한 보고서들의 날짜 목록(YYYY-MM-DD, 최신순)을 돌려준다. 특정 날짜의 본문은 get_report, 기간·키워드 조회는 search_reports 를 쓴다.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const { mode, allReportDates } = useReportHistoryStore.getState();
          return toolText({ storage: mode === 'user' ? 'account' : 'browser', dates: allReportDates });
        },
      },
      {
        name: 'get_report',
        description: '지정한 날짜에 저장된 보고서의 금일/익일 업무 내용을 돌려준다.',
        inputSchema: { type: 'object', properties: { date: DATE_KEY_SCHEMA }, required: ['date'] },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          const date = parseDateKeyInput(input.date, 'date');
          if (typeof date !== 'string') return toolError(date.error);
          const store = useReportHistoryStore.getState();
          if (!store.allReportDates.includes(date)) return toolError(`${date} 에 저장된 보고서가 없습니다.`);
          // 로그인 사용자는 월 단위로 lazy 적재한다 (게스트는 no-op).
          await store.loadMonth(parseInt(date.slice(0, 4), 10), parseInt(date.slice(5, 7), 10));
          const item = useReportHistoryStore.getState().history.find((i) => reportItemDateKey(i) === date);
          if (!item) return toolError(`${date} 보고서를 불러오지 못했습니다.`);
          return toolText(toAgentReport(item));
        },
      },
      {
        name: 'search_reports',
        description:
          '저장된 보고서를 기간(from~to, 양 끝 포함)과 키워드로 찾는다. 키워드를 주면 프로젝트명·작업·세부 항목에 키워드가 들어간 프로젝트만 남긴다. 주간/월간 보고나 특정 프로젝트 이력 정리에 쓴다. 결과는 날짜 오름차순이며 최근 62건까지만 돌려준다.',
        inputSchema: {
          type: 'object',
          properties: {
            from: { ...DATE_KEY_SCHEMA, description: '시작 날짜 (YYYY-MM-DD). 생략하면 처음부터' },
            to: { ...DATE_KEY_SCHEMA, description: '끝 날짜 (YYYY-MM-DD). 생략하면 끝까지' },
            query: { type: 'string', description: '검색 키워드 (대소문자 무시). 생략하면 기간 내 전체' },
          },
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          const from = input.from === undefined ? null : parseDateKeyInput(input.from, 'from');
          const to = input.to === undefined ? null : parseDateKeyInput(input.to, 'to');
          if (from !== null && typeof from !== 'string') return toolError(from.error);
          if (to !== null && typeof to !== 'string') return toolError(to.error);
          if (input.query !== undefined && typeof input.query !== 'string')
            return toolError('query 는 문자열이어야 합니다.');
          const query = (input.query ?? '').trim().toLowerCase();

          const all = await useReportHistoryStore.getState().fetchAllHistory();
          if (!all) return toolError('보고서 기록을 불러오지 못했습니다.');

          const matchesQuery = (p: AgentProject) =>
            [p.name, ...p.tasks.flatMap((t) => [t.content, ...t.details])].some((s) => s.toLowerCase().includes(query));

          const reports = all
            .map(toAgentReport)
            .filter((r) => (from === null || r.date >= from) && (to === null || r.date <= to))
            .map((r) =>
              query ? { ...r, today: r.today.filter(matchesQuery), tomorrow: r.tomorrow.filter(matchesQuery) } : r
            )
            .filter((r) => !query || r.today.length > 0 || r.tomorrow.length > 0);

          return toolText({
            total: reports.length,
            truncated: reports.length > MAX_SEARCH_RESULTS,
            reports: reports.slice(-MAX_SEARCH_RESULTS),
          });
        },
      },
      {
        name: 'fill_report',
        description:
          '보고서 폼을 채운다. today(금일 업무 진행 현황)·tomorrow(익일 업무 진행 예정) 중 준 버킷만 바꾸고, month/day 를 주면 보고서 날짜도 바꾼다. mode="replace"(기본)는 버킷을 통째로 교체하고, "append"는 같은 이름의 프로젝트에 작업을 덧붙이고 새 프로젝트는 뒤에 추가한다. 기존 내용을 고치려면 get_current_report 결과를 수정해 replace 로 다시 넣는다. 폼만 바꾸며 기록 저장은 save_report 로 따로 한다.',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'integer', minimum: 1, maximum: 12, description: '보고서 월. day 와 함께 준다' },
            day: { type: 'integer', minimum: 1, maximum: 31, description: '보고서 일. month 와 함께 준다' },
            today: { ...PROJECTS_SCHEMA, description: '금일 업무 진행 현황 프로젝트 목록' },
            tomorrow: { ...PROJECTS_SCHEMA, description: '익일 업무 진행 예정 프로젝트 목록' },
            mode: { type: 'string', enum: ['replace', 'append'], description: '기본값 replace' },
          },
        },
        execute: async (input) => {
          const mode = input.mode ?? 'replace';
          if (mode !== 'replace' && mode !== 'append') return toolError('mode 는 "replace" 또는 "append" 여야 합니다.');

          const hasDate = input.month !== undefined || input.day !== undefined;
          if (hasDate) {
            const { month, day } = input;
            if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12)
              return toolError('month 는 1~12 정수여야 합니다 (day 와 함께 주세요).');
            if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31)
              return toolError('day 는 1~31 정수여야 합니다 (month 와 함께 주세요).');
          }

          const updates: Array<[ProjectsBucket, Array<Project>]> = [];
          for (const bucket of ['today', 'tomorrow'] as const) {
            if (input[bucket] === undefined) continue;
            const parsed = parseProjectsInput(input[bucket], bucket);
            if (typeof parsed === 'string') return toolError(parsed);
            updates.push([bucket, parsed]);
          }
          if (!hasDate && updates.length === 0) return toolError('month/day, today, tomorrow 중 하나 이상을 주세요.');

          const store = useReportFormStore.getState();
          if (hasDate) store.setReportDate({ month: String(input.month), day: String(input.day) });
          for (const [bucket, projects] of updates) {
            store.setBucket(bucket, (prev) =>
              mode === 'append' ? appendProjects(prev, projects) : orInitial(projects)
            );
          }
          toast.success('에이전트가 보고서 폼을 채웠습니다.');
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'import_report_text',
        description:
          '이미 작성된 일일 업무 보고 텍스트("N월 N일 ... 금일 업무 진행 현황 / 익일 업무 진행 예정" 형식, 들여쓰기 * 프로젝트 / - 작업 (NN%) / · 세부 항목)를 분석해 폼 전체를 교체한다. 형식이 느슨해도 최대한 복원한다.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', description: '보고서 텍스트 원문' } },
          required: ['text'],
        },
        execute: async (input) => {
          if (typeof input.text !== 'string') return toolError('text 는 문자열이어야 합니다.');
          const parsed = parseReportText(input.text);
          if (!parsed || (parsed.todayProjects.length === 0 && parsed.tomorrowProjects.length === 0))
            return toolError('보고서 텍스트에서 프로젝트를 찾지 못했습니다.');

          const store = useReportFormStore.getState();
          if (parsed.month && parsed.day) store.setReportDate({ month: parsed.month, day: parsed.day });
          store.setBucket('today', orInitial(parsed.todayProjects));
          store.setBucket('tomorrow', orInitial(parsed.tomorrowProjects));
          toast.success('에이전트가 보고서 텍스트를 폼에 적용했습니다.');
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'carry_over_incomplete_tasks',
        description:
          '금일 업무 중 진행률 100% 미만인 작업을 익일 업무 진행 예정으로 복사한다. 같은 이름의 프로젝트에는 작업만 덧붙이고, 이미 있는 작업은 건너뛴다.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          const { today, tomorrow, setBucket } = useReportFormStore.getState();
          const merged = mergeIncompleteTasks(today, tomorrow);
          if (!merged) return toolText({ changed: false, message: '가져올 새로운 미완료 작업이 없습니다.' });
          setBucket('tomorrow', merged);
          toast.success('에이전트가 미완료 업무를 익일로 가져왔습니다.');
          return toolText({ changed: true, ...currentFormSnapshot() });
        },
      },
      {
        name: 'save_report',
        description:
          '현재 폼 내용을 보고서 날짜의 기록으로 저장한다. 같은 날짜 기록이 있으면 덮어쓴다. 사용자에게 확인 창을 띄우고, 사용자가 승인해야 저장된다. 클립보드 복사는 하지 않는다.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          const { reportDate, today, tomorrow } = useReportFormStore.getState();
          if (!isSavable(today, tomorrow))
            return toolError('저장할 수 없습니다. 내용이 비어 있거나, 작업이 없는 프로젝트가 있습니다.');

          const ok = await confirm({
            title: '보고서 저장',
            description: `에이전트가 ${reportDate.month}월 ${reportDate.day}일 보고서를 기록에 저장하려고 합니다.\n같은 날짜 기록이 있으면 덮어씁니다.`,
            confirmText: '저장',
          });
          if (!ok) return toolError('사용자가 저장을 취소했습니다.');

          await useReportHistoryStore
            .getState()
            .addHistory({ ...reportDate, todayProjects: today, tomorrowProjects: tomorrow });
          handleSaved(reportDate);
          toast.success('보고서를 기록에 저장했습니다.');
          return toolText({ saved: true, month: Number(reportDate.month), day: Number(reportDate.day) });
        },
      },
    ];

    // 다른 화면으로 이동해 이 페이지가 숨겨지면(Activity) cleanup 이 돌아 도구도 함께 내려간다.
    const controller = new AbortController();
    registerWebMcpTools(tools, controller.signal);
    return () => controller.abort();
  }, [enabled]);
};
