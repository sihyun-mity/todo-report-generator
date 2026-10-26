import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import type {
  AgentTool,
  AgentToolContext,
  Project,
  ProjectsBucket,
  ReportDate,
  ReportHistoryItem,
  WebMcpJsonSchema,
} from '@/types';
import { useReportFormStore, useReportHistoryStore } from '@/stores';
import { toolError, toolText } from '@/lib/webmcp';
import { useAgentTools } from '.';
import {
  areAllAttemptedProjectsValid,
  createEmptyProject,
  createId,
  downloadReportHistory,
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

const BUCKET_LABEL: Record<ProjectsBucket, string> = { today: '금일 업무 구역', tomorrow: '익일 업무 구역' };

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

// month/day 쌍 검증 — 둘 다 있어야 한다
const parseMonthDayInput = (input: Record<string, unknown>): ReportDate | string => {
  const { month, day } = input;
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12)
    return 'month 는 1~12 정수여야 합니다 (day 와 함께 주세요).';
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31)
    return 'day 는 1~31 정수여야 합니다 (month 와 함께 주세요).';
  return { month: String(month), day: String(day) };
};

// 저장된 보고서 한 건을 찾는다. 로그인 사용자는 월 단위로 lazy 적재하므로 해당 월을 먼저 불러온다 (게스트는 no-op).
const findSavedReport = async (date: string): Promise<ReportHistoryItem | string> => {
  const store = useReportHistoryStore.getState();
  if (!store.allReportDates.includes(date)) return `${date} 에 저장된 보고서가 없습니다.`;
  await store.loadMonth(parseInt(date.slice(0, 4), 10), parseInt(date.slice(5, 7), 10));
  const item = useReportHistoryStore.getState().history.find((i) => reportItemDateKey(i) === date);
  return item ?? `${date} 보고서를 불러오지 못했습니다.`;
};

// 구역을 통째로 바꿀 때 지금 적힌 내용이 사라지면 확인을 받는다. 지울 내용이 없으면 묻지 않는다.
const confirmReplace = async (buckets: ReadonlyArray<ProjectsBucket>, confirm: AgentToolContext['confirm']) => {
  const current = useReportFormStore.getState();
  const dropped = buckets.filter((bucket) => current[bucket].some(hasProjectContent));
  if (dropped.length === 0) return true;
  return confirm({
    title: '작성 중인 내용 교체',
    description: `에이전트가 ${dropped.map((bucket) => BUCKET_LABEL[bucket]).join('·')}을 새 내용으로 교체하려고 합니다.\n지금 적혀 있는 프로젝트·작업은 사라집니다.`,
    confirmText: '교체',
    variant: 'danger',
  });
};

const SECTION_SCHEMA: WebMcpJsonSchema = {
  type: 'string',
  enum: ['today', 'tomorrow'],
  description: 'today = 금일 업무 진행 현황(오늘 한 일), tomorrow = 익일 업무 진행 예정(내일 할 일)',
};

const parseSectionInput = (value: unknown): ProjectsBucket | null =>
  value === 'today' || value === 'tomorrow' ? value : null;

const formHasContent = () => {
  const { today, tomorrow } = useReportFormStore.getState();
  return today.some(hasProjectContent) || tomorrow.some(hasProjectContent);
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
  // load_report / reset_report_form 으로 폼을 통째로 바꾼 직후 — 이탈 경고 baseline 갱신
  onReplaced: () => void;
  // GitHub 커밋 가져오기 다이얼로그 열기 (조회 범위 계산은 폼이 한다)
  onOpenGithubImport: () => void;
};

// 보고서 작성 화면의 기능을 에이전트 도구로 노출한다 (WebMCP + 앱 안 채팅, `useAgentTools`).
// 도구는 DOM 을 거치지 않고 store 액션을 직접 호출하므로, 에이전트의 변경도 사용자 입력과 똑같이 화면에 반영된다.
export const useReportAgentTools = ({ enabled, onSaved, onReplaced, onOpenGithubImport }: Readonly<Options>) => {
  // 도구는 등록 시점에 한 번 만들어지므로, 실행 시점의 최신 콜백을 ref 로 읽는다
  const callbacks = useRef({ onSaved, onReplaced, onOpenGithubImport });
  useEffect(() => {
    callbacks.current = { onSaved, onReplaced, onOpenGithubImport };
  });

  useAgentTools(
    (): Array<AgentTool> => [
      {
        name: 'get_current_report',
        title: '작성 중인 보고서 확인',
        kind: 'read',
        description:
          '현재 작성 중인 일일 업무 보고서 폼의 내용을 돌려준다. 보고서 날짜(month/day), 금일 업무(today), 익일 업무(tomorrow), 저장 가능 여부(canSave), 완성된 보고서 텍스트(text)를 포함한다. 폼을 수정하기 전에 먼저 호출해 현재 상태를 확인한다.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolText(currentFormSnapshot()),
      },
      {
        name: 'list_report_dates',
        title: '저장된 보고서 날짜 조회',
        kind: 'read',
        description:
          '저장된 보고서의 날짜 목록(YYYY-MM-DD, 최신순)만 돌려준다 — 보고서 내용은 없다. 어느 날짜에 기록이 있는지만 필요할 때 쓴다. 내용을 보거나 정리하려면 search_reports(기간·키워드) 또는 get_report(하루)를 쓴다.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const { mode, allReportDates } = useReportHistoryStore.getState();
          return toolText({ storage: mode === 'user' ? 'account' : 'browser', dates: allReportDates });
        },
      },
      {
        name: 'get_report',
        title: '저장된 보고서 조회',
        kind: 'read',
        description: '지정한 날짜에 저장된 보고서의 금일/익일 업무 내용을 돌려준다.',
        inputSchema: { type: 'object', properties: { date: DATE_KEY_SCHEMA }, required: ['date'] },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          const date = parseDateKeyInput(input.date, 'date');
          if (typeof date !== 'string') return toolError(date.error);
          const item = await findSavedReport(date);
          if (typeof item === 'string') return toolError(item);
          return toolText(toAgentReport(item));
        },
      },
      {
        name: 'search_reports',
        title: '보고서 기록 검색',
        kind: 'read',
        description:
          '저장된 보고서의 내용을 기간(from~to, 양 끝 포함)과 키워드로 찾는다. "이번 주 보고서 정리", "지난달 ○○ 작업 찾기"처럼 여러 날의 내용을 보거나 정리할 때 쓴다. 키워드를 주면 프로젝트명·작업·세부 항목에 키워드가 들어간 프로젝트만 남긴다. 주간/월간 보고나 특정 프로젝트 이력 정리에 쓴다. 결과는 날짜 오름차순이며 최근 62건까지만 돌려준다.',
        inputSchema: {
          type: 'object',
          properties: {
            from: { ...DATE_KEY_SCHEMA, description: '시작 날짜 (YYYY-MM-DD). 생략하면 처음부터' },
            to: { ...DATE_KEY_SCHEMA, description: '끝 날짜 (YYYY-MM-DD). 생략하면 끝까지' },
            query: {
              type: 'string',
              description:
                '프로젝트명·작업에 들어간 단어 하나(대소문자 무시, 예: "토큰"). 특정 단어를 찾을 때만 주고, 기간 전체를 보거나 정리할 때는 생략한다',
            },
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

          const inPeriod = all
            .map(toAgentReport)
            .filter((r) => (from === null || r.date >= from) && (to === null || r.date <= to));
          const reports = inPeriod
            .map((r) =>
              query ? { ...r, today: r.today.filter(matchesQuery), tomorrow: r.tomorrow.filter(matchesQuery) } : r
            )
            .filter((r) => !query || r.today.length > 0 || r.tomorrow.length > 0);

          // 에이전트가 요청 문장을 통째로 키워드로 넣어 0건이 되는 경우가 있어, 기간 안 보고서 수와 함께 다시 찾는 법을 알린다
          if (query && reports.length === 0 && inPeriod.length > 0)
            return toolText({
              total: 0,
              reportsInPeriod: inPeriod.length,
              hint: '키워드와 일치하는 프로젝트가 없습니다. 기간 전체를 보려면 query 를 빼고 다시 부르세요.',
            });

          return toolText({
            total: reports.length,
            truncated: reports.length > MAX_SEARCH_RESULTS,
            reports: reports.slice(-MAX_SEARCH_RESULTS),
          });
        },
      },
      {
        name: 'fill_report',
        title: '보고서 폼 채우기',
        kind: 'replace',
        // 여러 구역·날짜·모드를 한 번에 받는 도구라 Gemini Nano 가 구역을 헷갈리고 필드를 지어냈다 — 채팅은 아래 단순한 도구를 쓴다
        surfaces: ['webmcp'],
        description:
          '보고서 폼에 프로젝트·작업을 넣는다. today(금일 업무 진행 현황)·tomorrow(익일 업무 진행 예정) 중 바꿀 구역만 주고, 바꾸지 않을 구역은 생략한다(빈 배열은 무시). mode="append"(기본)는 같은 이름의 프로젝트에 작업을 덧붙이고 새 프로젝트는 뒤에 추가한다 — 추가 요청은 항상 append. "replace"는 그 구역을 통째로 교체하며, 기존 내용이 사라지면 사용자에게 확인을 받는다. 기존 내용을 고치려면 get_current_report 결과를 수정해 replace 로 다시 넣는다. 폼만 바꾸며 기록 저장은 save_report 로 따로 한다.',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'integer', minimum: 1, maximum: 12, description: '보고서 월. day 와 함께 준다' },
            day: { type: 'integer', minimum: 1, maximum: 31, description: '보고서 일. month 와 함께 준다' },
            today: { ...PROJECTS_SCHEMA, description: '금일 업무 진행 현황 프로젝트 목록' },
            tomorrow: { ...PROJECTS_SCHEMA, description: '익일 업무 진행 예정 프로젝트 목록' },
            mode: { type: 'string', enum: ['append', 'replace'], description: '기본값 append' },
          },
        },
        execute: async (input, { confirm }) => {
          // 작은 모델은 스키마의 모든 필드를 채우는 경향이 있어(추가 요청에 replace·빈 구역까지), 기본값을 덧붙이기로 두고
          // 빈 배열은 "바꾸지 않음"으로 본다. 기존 내용을 지우는 교체는 확인을 받는다.
          const mode = input.mode ?? 'append';
          if (mode !== 'replace' && mode !== 'append') return toolError('mode 는 "append" 또는 "replace" 여야 합니다.');

          const hasDate = input.month !== undefined || input.day !== undefined;
          const date = hasDate ? parseMonthDayInput(input) : null;
          if (typeof date === 'string') return toolError(date);

          const updates: Array<[ProjectsBucket, Array<Project>]> = [];
          for (const bucket of ['today', 'tomorrow'] as const) {
            const value = input[bucket];
            if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
            const parsed = parseProjectsInput(value, bucket);
            if (typeof parsed === 'string') return toolError(parsed);
            updates.push([bucket, parsed]);
          }
          if (!date && updates.length === 0) return toolError('month/day, today, tomorrow 중 하나 이상을 주세요.');

          if (
            mode === 'replace' &&
            !(await confirmReplace(
              updates.map(([bucket]) => bucket),
              confirm
            ))
          )
            return toolError('사용자가 교체를 취소했습니다. 덧붙이려면 mode="append" 로 다시 부르세요.');

          const store = useReportFormStore.getState();
          if (date) store.setReportDate(date);
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
        name: 'add_report_tasks',
        title: '보고서에 작업 추가',
        kind: 'add',
        description:
          '보고서 폼의 한 구역에 프로젝트 하나와 그 작업들을 덧붙인다. 같은 이름의 프로젝트가 있으면 그 아래에 작업을 추가하고, 없으면 새 프로젝트를 만든다. 기존 내용은 지우지 않는다.',
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            project: { type: 'string', description: '프로젝트명' },
            tasks: {
              type: 'array',
              minItems: 1,
              description: '추가할 작업 목록 (사용자가 말한 것만)',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: '작업 내용 (한 줄)' },
                  progress: { type: 'integer', minimum: 0, maximum: 100, description: '진행률(%). 말하지 않았으면 0' },
                },
                required: ['content'],
              },
            },
          },
          required: ['section', 'project', 'tasks'],
        },
        execute: async (input) => {
          const section = parseSectionInput(input.section);
          if (!section) return toolError('section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const parsed = parseProjectsInput([{ name: input.project, tasks: input.tasks }], 'input');
          if (typeof parsed === 'string')
            return toolError(parsed.replace('input[0].name', 'project').replace('input[0].', ''));
          useReportFormStore.getState().setBucket(section, (prev) => appendProjects(prev, parsed));
          toast.success(`에이전트가 ${BUCKET_LABEL[section]}에 작업을 추가했습니다.`);
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'replace_report_section',
        title: '보고서 구역 바꾸기',
        kind: 'replace',
        description:
          '보고서 폼의 한 구역을 주어진 프로젝트 목록으로 통째로 바꾼다. 지금 적힌 내용이 사라지면 사용자에게 확인을 받는다. 덧붙이기만 하려면 add_report_tasks 를 쓴다.',
        inputSchema: {
          type: 'object',
          properties: { section: SECTION_SCHEMA, projects: { ...PROJECTS_SCHEMA, minItems: 1 } },
          required: ['section', 'projects'],
        },
        execute: async (input, { confirm }) => {
          const section = parseSectionInput(input.section);
          if (!section) return toolError('section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const parsed = parseProjectsInput(input.projects, 'projects');
          if (typeof parsed === 'string') return toolError(parsed);
          if (parsed.length === 0) return toolError('projects 에 프로젝트가 1개 이상 필요합니다.');
          if (!(await confirmReplace([section], confirm))) return toolError('사용자가 교체를 취소했습니다.');
          useReportFormStore.getState().setBucket(section, parsed);
          toast.success(`에이전트가 ${BUCKET_LABEL[section]}을 바꿨습니다.`);
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'import_report_text',
        title: '보고서 텍스트 적용',
        kind: 'replace',
        description:
          '이미 작성된 일일 업무 보고 텍스트("N월 N일 ... 금일 업무 진행 현황 / 익일 업무 진행 예정" 형식, 들여쓰기 * 프로젝트 / - 작업 (NN%) / · 세부 항목)를 분석해 폼 전체를 교체한다. 작성 중인 내용이 있으면 사용자에게 확인을 받는다. 형식이 느슨해도 최대한 복원한다.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', description: '보고서 텍스트 원문' } },
          required: ['text'],
        },
        execute: async (input, { confirm }) => {
          if (typeof input.text !== 'string') return toolError('text 는 문자열이어야 합니다.');
          const parsed = parseReportText(input.text);
          if (!parsed || (parsed.todayProjects.length === 0 && parsed.tomorrowProjects.length === 0))
            return toolError('보고서 텍스트에서 프로젝트를 찾지 못했습니다.');
          if (formHasContent()) {
            const ok = await confirm({
              title: '텍스트 적용',
              description: '에이전트가 보고서 텍스트를 폼에 적용하려고 합니다.\n현재 작성 중인 내용이 덮어씌워집니다.',
              confirmText: '적용',
            });
            if (!ok) return toolError('사용자가 텍스트 적용을 취소했습니다.');
          }

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
        title: '미완료 업무 익일로 가져오기',
        kind: 'add',
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
        title: '보고서 기록에 저장',
        kind: 'save',
        description:
          '사용자가 저장을 요청했을 때만 현재 폼 내용을 보고서 날짜의 기록으로 저장한다. 같은 날짜 기록이 있으면 덮어쓴다. 사용자에게 확인 창을 띄우고, 사용자가 승인해야 저장된다. 클립보드 복사는 하지 않는다.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, { confirm }) => {
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
          callbacks.current.onSaved(reportDate);
          toast.success('보고서를 기록에 저장했습니다.');
          return toolText({ saved: true, month: Number(reportDate.month), day: Number(reportDate.day) });
        },
      },
      {
        name: 'set_report_date',
        title: '보고서 날짜 바꾸기',
        kind: 'replace',
        description: '보고서 폼의 날짜(월/일)만 바꾼다. 내용은 그대로 둔다. 연도는 올해로 본다.',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'integer', minimum: 1, maximum: 12, description: '보고서 월' },
            day: { type: 'integer', minimum: 1, maximum: 31, description: '보고서 일' },
          },
          required: ['month', 'day'],
        },
        execute: async (input) => {
          const date = parseMonthDayInput(input);
          if (typeof date === 'string') return toolError(date);
          useReportFormStore.getState().setReportDate(date);
          toast.success(`보고서 날짜를 ${date.month}월 ${date.day}일로 바꿨습니다.`);
          return toolText({ month: Number(date.month), day: Number(date.day) });
        },
      },
      {
        name: 'load_report',
        title: '저장된 보고서 불러오기',
        kind: 'replace',
        description:
          '지정한 날짜에 저장된 보고서를 폼으로 불러온다(날짜·금일·익일 모두 교체). 작성 중인 내용이 있으면 사용자에게 덮어쓸지 확인한다. 내용만 보려면 get_report 를 쓴다.',
        inputSchema: { type: 'object', properties: { date: DATE_KEY_SCHEMA }, required: ['date'] },
        execute: async (input, { confirm }) => {
          const date = parseDateKeyInput(input.date, 'date');
          if (typeof date !== 'string') return toolError(date.error);
          const item = await findSavedReport(date);
          if (typeof item === 'string') return toolError(item);

          if (formHasContent()) {
            const ok = await confirm({
              title: '기록 불러오기',
              description: `${item.month}월 ${item.day}일 보고서를 불러오면 현재 작성 중인 내용이 덮어씌워집니다.`,
              confirmText: '불러오기',
            });
            if (!ok) return toolError('사용자가 불러오기를 취소했습니다.');
          }

          const store = useReportFormStore.getState();
          store.setReportDate({ month: item.month, day: item.day });
          store.setBucket('today', orInitial([...item.todayProjects]));
          store.setBucket('tomorrow', orInitial([...item.tomorrowProjects]));
          callbacks.current.onReplaced();
          toast.success(`${item.month}월 ${item.day}일 보고서를 불러왔습니다.`);
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'reset_report_form',
        title: '보고서 폼 초기화',
        kind: 'reset',
        description: '보고서 폼을 빈 상태로 초기화한다. 저장된 기록은 지우지 않는다. 사용자에게 확인 창을 띄운다.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, { confirm }) => {
          if (!formHasContent()) return toolText({ changed: false, message: '폼이 이미 비어 있습니다.' });
          const ok = await confirm({
            title: '폼 초기화',
            description: '작성 중인 내용이 모두 초기화됩니다. 저장된 기록은 그대로 남습니다.',
            confirmText: '초기화',
            variant: 'danger',
          });
          if (!ok) return toolError('사용자가 초기화를 취소했습니다.');
          useReportFormStore.getState().resetForm();
          callbacks.current.onReplaced();
          toast.success('보고서 폼을 초기화했습니다.');
          return toolText({ changed: true, ...currentFormSnapshot() });
        },
      },
      {
        name: 'export_reports',
        title: '보고서 기록 내보내기',
        kind: 'save',
        description:
          '저장된 보고서 기록 전체를 파일로 내려받는다. format 은 "txt"(보고서 본문을 날짜순으로) 또는 "json"(프로젝트·작업·진행률 구조). 기록은 그대로 남는다. 사용자에게 확인 창을 띄운다.',
        inputSchema: {
          type: 'object',
          properties: { format: { type: 'string', enum: ['txt', 'json'], description: '파일 형식. 기본값 txt' } },
        },
        execute: async (input, { confirm }) => {
          const format = input.format ?? 'txt';
          if (format !== 'txt' && format !== 'json') return toolError('format 은 "txt" 또는 "json" 이어야 합니다.');
          const items = await useReportHistoryStore.getState().fetchAllHistory();
          if (!items) return toolError('보고서 기록을 불러오지 못했습니다.');
          if (items.length === 0) return toolError('내보낼 기록이 없습니다.');

          const ok = await confirm({
            title: '기록 내보내기',
            description: `보고서 기록 ${items.length}건을 ${format === 'txt' ? '텍스트(.txt)' : 'JSON(.json)'} 파일로 내려받습니다.`,
            confirmText: '내려받기',
          });
          if (!ok) return toolError('사용자가 내보내기를 취소했습니다.');
          downloadReportHistory(items, format);
          toast.success(`기록 ${items.length}건을 내보냈습니다.`);
          return toolText({ exported: items.length, format });
        },
      },
      {
        name: 'open_github_import',
        title: 'GitHub 커밋 가져오기 열기',
        kind: 'navigate',
        description:
          'GitHub 커밋을 불러와 금일 업무로 정리하는 "GitHub에서 가져오기" 창을 연다. 커밋 선택·적용은 사용자가 창에서 직접 한다. 로그인 회원 전용이라 게스트에게는 로그인 안내가 보인다.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          callbacks.current.onOpenGithubImport();
          const isMember = useReportHistoryStore.getState().mode === 'user';
          return toolText({
            opened: true,
            message: isMember
              ? '가져오기 창을 열었습니다. 사용자가 창에서 커밋을 확인하고 적용합니다.'
              : '게스트라 로그인 안내가 표시됩니다. 커밋 가져오기는 로그인 후 쓸 수 있습니다.',
          });
        },
      },
    ],
    enabled
  );
};
