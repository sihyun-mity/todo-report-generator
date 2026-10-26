import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import type {
  AgentTool,
  AgentToolContext,
  Project,
  ProjectsBucket,
  ReportDate,
  ReportFormSnapshot,
  ReportHistoryItem,
  WebMcpJsonSchema,
} from '@/types';
import { useAgentHighlightStore, useReportFormStore, useReportHistoryStore } from '@/stores';
import { AGENT_HIGHLIGHT_DATE_ID } from '@/constants';
import { toolError, toolText } from '@/lib/webmcp';
import { useAgentTools } from '.';
import {
  areAllAttemptedProjectsValid,
  createEmptyProject,
  createId,
  diffReportForm,
  downloadReportHistory,
  isSameReportForm,
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

// search_reports 의 query 로 들어오면 무시하는 말 — 기간이나 "보고서" 자체를 가리킬 뿐 프로젝트·작업 키워드가 아니다
const QUERY_STOP_WORDS_REGEX =
  /^(지난\s?주|이번\s?주|저번\s?주|지난\s?달|이번\s?달|저번\s?달|오늘|어제|최근|전체|모두|보고서|기록|업무|요약|정리)(\s*(보고서|기록|업무|요약|정리))*$/;

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
  description:
    'today = 금일 업무 진행 현황 (work done today), tomorrow = 익일 업무 진행 예정 (work planned for tomorrow)',
};

const parseSectionInput = (value: unknown): ProjectsBucket | null =>
  value === 'today' || value === 'tomorrow' ? value : null;

const formSnapshot = (): ReportFormSnapshot => {
  const { reportDate, today, tomorrow } = useReportFormStore.getState();
  return { reportDate, today, tomorrow };
};

// 폼을 바꾸기 직전에 부르고, 바꾼 뒤 돌려받은 함수를 부른다 — 바뀐 칸을 강조하고(WebMCP 로 불러도) 채팅에는 변경 카드용
// 줄과 되돌리기를 넘긴다. 되돌리기는 바꾼 뒤 그대로일 때만 한다(그사이 사용자가 고쳤으면 덮어쓰지 않는다).
const beginFormChange = (context: AgentToolContext) => {
  const before = formSnapshot();
  return () => {
    const after = formSnapshot();
    const { lines, changedIds, dateChanged } = diffReportForm(before, after);
    const { flash } = useAgentHighlightStore.getState();
    flash([...changedIds, ...(dateChanged ? [AGENT_HIGHLIGHT_DATE_ID] : [])]);
    if (lines.length === 0) return;
    context.reportChange?.({
      lines,
      undo: () => {
        if (!isSameReportForm(formSnapshot(), after)) return false;
        const store = useReportFormStore.getState();
        store.setReportDate(before.reportDate);
        store.setBucket('today', [...before.today]);
        store.setBucket('tomorrow', [...before.tomorrow]);
        const restored = diffReportForm(after, before);
        flash([...restored.changedIds, ...(restored.dateChanged ? [AGENT_HIGHLIGHT_DATE_ID] : [])]);
        return true;
      },
    });
  };
};

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
  description: 'List of projects. Each project has one or more tasks.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: "Project name (keep the user's wording)" },
      tasks: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: "Task text (one line, keep the user's wording)" },
            progress: { type: 'integer', minimum: 0, maximum: 100, description: 'Progress (%). Defaults to 0' },
            details: {
              type: 'array',
              items: { type: 'string' },
              description: 'Detail lines under the task. No progress.',
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
  description: 'Report date (YYYY-MM-DD)',
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
          'Return the daily report form currently being written: report date (month/day), today, tomorrow, whether it can be saved (canSave) and the finished report text (text). Call it to check the current state before editing.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolText(currentFormSnapshot()),
      },
      {
        name: 'list_report_dates',
        title: '저장된 보고서 날짜 조회',
        kind: 'read',
        description:
          'Return only the dates (YYYY-MM-DD, newest first) that have saved reports — no content. Use it only to know which dates have records. To view or summarize content, use search_reports (range/keyword) or get_report (one day).',
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
        description: 'Return the saved report (today and tomorrow sections) for the given date.',
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
          'Search saved report contents by date range (from~to, inclusive) and keyword. Use it to view or summarize several days, e.g. "summarize this week" or "find last month\'s token tasks". With a keyword, only projects whose name, tasks or details contain it are kept. Results are in ascending date order, up to the latest 62 reports.',
        inputSchema: {
          type: 'object',
          properties: {
            from: { ...DATE_KEY_SCHEMA, description: 'Start date (YYYY-MM-DD). Omit for the beginning' },
            to: { ...DATE_KEY_SCHEMA, description: 'End date (YYYY-MM-DD). Omit for the latest' },
            query: {
              type: 'string',
              description:
                'A single word that appears in project names or tasks (case-insensitive, e.g. "토큰"). Give it only to find a specific word; omit it to view or summarize a whole period',
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
          // 기간·대상을 가리키는 말("지난주", "보고서")은 검색어가 아니다 — 작은 모델이 이런 말을 query 로 넣어 0건이 됐다
          const rawQuery = (input.query ?? '').trim().toLowerCase();
          const query = QUERY_STOP_WORDS_REGEX.test(rawQuery) ? '' : rawQuery;

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

          // 키워드로 하나도 안 나오면 기간 전체를 돌려준다 — "query 를 빼고 다시 부르라"고 알려도 모델이 같은 호출을 되풀이했다
          if (query && reports.length === 0 && inPeriod.length > 0)
            return toolText({
              total: inPeriod.length,
              note: `"${rawQuery}" 와 일치하는 프로젝트가 없어 기간 안의 보고서 전체를 돌려줍니다.`,
              truncated: inPeriod.length > MAX_SEARCH_RESULTS,
              reports: inPeriod.slice(-MAX_SEARCH_RESULTS),
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
          'Put projects and tasks into the report form. Give only the sections to change — today (금일 업무 진행 현황) and/or tomorrow (익일 업무 진행 예정); omit the others (empty arrays are ignored). mode="append" (default) adds tasks to the project with the same name and appends new projects — always use append for add requests. "replace" replaces the section entirely and asks the user to confirm if existing content would be lost. To edit existing content, modify the get_current_report result and put it back with replace. Only changes the form; saving is save_report.',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'integer', minimum: 1, maximum: 12, description: 'Report month. Give together with day' },
            day: { type: 'integer', minimum: 1, maximum: 31, description: 'Report day. Give together with month' },
            today: { ...PROJECTS_SCHEMA, description: 'Projects for today (금일 업무 진행 현황)' },
            tomorrow: { ...PROJECTS_SCHEMA, description: 'Projects for tomorrow (익일 업무 진행 예정)' },
            mode: { type: 'string', enum: ['append', 'replace'], description: 'Defaults to append' },
          },
        },
        execute: async (input, context) => {
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
              context.confirm
            ))
          )
            return toolError('사용자가 교체를 취소했습니다. 덧붙이려면 mode="append" 로 다시 부르세요.');

          const finish = beginFormChange(context);
          const store = useReportFormStore.getState();
          if (date) store.setReportDate(date);
          for (const [bucket, projects] of updates) {
            store.setBucket(bucket, (prev) =>
              mode === 'append' ? appendProjects(prev, projects) : orInitial(projects)
            );
          }
          finish();
          toast.success('에이전트가 보고서 폼을 채웠습니다.');
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'add_report_tasks',
        title: '보고서에 작업 추가',
        kind: 'add',
        description:
          'Append one project and its tasks to one section of the report form. If a project with the same name exists, the tasks are added under it; otherwise a new project is created. Existing content is kept.',
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            project: { type: 'string', description: "Project name (keep the user's wording)" },
            tasks: {
              type: 'array',
              minItems: 1,
              description: 'Tasks to add (only what the user mentioned)',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: "Task text (one line, keep the user's wording)" },
                  progress: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 100,
                    description: 'Progress (%). 0 if not mentioned',
                  },
                },
                required: ['content'],
              },
            },
          },
          required: ['section', 'project', 'tasks'],
        },
        execute: async (input, context) => {
          const section = parseSectionInput(input.section);
          if (!section) return toolError('section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const parsed = parseProjectsInput([{ name: input.project, tasks: input.tasks }], 'input');
          if (typeof parsed === 'string')
            return toolError(parsed.replace('input[0].name', 'project').replace('input[0].', ''));
          const finish = beginFormChange(context);
          useReportFormStore.getState().setBucket(section, (prev) => appendProjects(prev, parsed));
          finish();
          toast.success(`에이전트가 ${BUCKET_LABEL[section]}에 작업을 추가했습니다.`);
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'replace_report_section',
        title: '보고서 구역 바꾸기',
        kind: 'replace',
        description:
          'Replace one section of the report form entirely with the given projects. Asks the user to confirm if current content would be lost. To only append, use add_report_tasks.',
        inputSchema: {
          type: 'object',
          properties: { section: SECTION_SCHEMA, projects: { ...PROJECTS_SCHEMA, minItems: 1 } },
          required: ['section', 'projects'],
        },
        execute: async (input, context) => {
          const section = parseSectionInput(input.section);
          if (!section) return toolError('section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const parsed = parseProjectsInput(input.projects, 'projects');
          if (typeof parsed === 'string') return toolError(parsed);
          if (parsed.length === 0) return toolError('projects 에 프로젝트가 1개 이상 필요합니다.');
          if (!(await confirmReplace([section], context.confirm))) return toolError('사용자가 교체를 취소했습니다.');
          const finish = beginFormChange(context);
          useReportFormStore.getState().setBucket(section, parsed);
          finish();
          toast.success(`에이전트가 ${BUCKET_LABEL[section]}을 바꿨습니다.`);
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'import_report_text',
        title: '보고서 텍스트 적용',
        kind: 'replace',
        description:
          'Parse an existing daily report text ("N월 N일 ... 금일 업무 진행 현황 / 익일 업무 진행 예정" format, indented * project / - task (NN%) / · detail) and replace the whole form with it. Asks the user to confirm if the form has content. Tolerates loose formatting.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', description: 'The report text as-is' } },
          required: ['text'],
        },
        execute: async (input, context) => {
          if (typeof input.text !== 'string') return toolError('text 는 문자열이어야 합니다.');
          const parsed = parseReportText(input.text);
          if (!parsed || (parsed.todayProjects.length === 0 && parsed.tomorrowProjects.length === 0))
            return toolError('보고서 텍스트에서 프로젝트를 찾지 못했습니다.');
          if (formHasContent()) {
            const ok = await context.confirm({
              title: '텍스트 적용',
              description: '에이전트가 보고서 텍스트를 폼에 적용하려고 합니다.\n현재 작성 중인 내용이 덮어씌워집니다.',
              confirmText: '적용',
            });
            if (!ok) return toolError('사용자가 텍스트 적용을 취소했습니다.');
          }

          const store = useReportFormStore.getState();
          const finish = beginFormChange(context);
          if (parsed.month && parsed.day) store.setReportDate({ month: parsed.month, day: parsed.day });
          store.setBucket('today', orInitial(parsed.todayProjects));
          store.setBucket('tomorrow', orInitial(parsed.tomorrowProjects));
          finish();
          toast.success('에이전트가 보고서 텍스트를 폼에 적용했습니다.');
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'carry_over_incomplete_tasks',
        title: '미완료 업무 익일로 가져오기',
        kind: 'add',
        description:
          "Copy today's tasks under 100% progress to tomorrow. Tasks are added under projects with the same name; tasks already there are skipped.",
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const { today, tomorrow, setBucket } = useReportFormStore.getState();
          const merged = mergeIncompleteTasks(today, tomorrow);
          if (!merged) return toolText({ changed: false, message: '가져올 새로운 미완료 작업이 없습니다.' });
          const finish = beginFormChange(context);
          setBucket('tomorrow', merged);
          finish();
          toast.success('에이전트가 미완료 업무를 익일로 가져왔습니다.');
          return toolText({ changed: true, ...currentFormSnapshot() });
        },
      },
      {
        name: 'save_report',
        title: '보고서 기록에 저장',
        kind: 'save',
        description:
          'Only when the user asks to save: save the current form as the record for the report date, overwriting an existing record for that date. Shows a confirmation and saves only if the user approves. Does not copy to the clipboard.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const { reportDate, today, tomorrow } = useReportFormStore.getState();
          if (!isSavable(today, tomorrow))
            return toolError('저장할 수 없습니다. 내용이 비어 있거나, 작업이 없는 프로젝트가 있습니다.');

          const ok = await context.confirm({
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
        description:
          'Change only the report date (month/day) of the form; content stays. The year is the current year.',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'integer', minimum: 1, maximum: 12, description: 'Report month' },
            day: { type: 'integer', minimum: 1, maximum: 31, description: 'Report day' },
          },
          required: ['month', 'day'],
        },
        execute: async (input, context) => {
          const date = parseMonthDayInput(input);
          if (typeof date === 'string') return toolError(date);
          const finish = beginFormChange(context);
          useReportFormStore.getState().setReportDate(date);
          finish();
          toast.success(`보고서 날짜를 ${date.month}월 ${date.day}일로 바꿨습니다.`);
          return toolText({ month: Number(date.month), day: Number(date.day) });
        },
      },
      {
        name: 'load_report',
        title: '저장된 보고서 불러오기',
        kind: 'replace',
        description:
          'Load the saved report for a date into the form (replaces date, today and tomorrow). Asks the user to confirm if the form has content. To only view it, use get_report.',
        inputSchema: { type: 'object', properties: { date: DATE_KEY_SCHEMA }, required: ['date'] },
        execute: async (input, context) => {
          const date = parseDateKeyInput(input.date, 'date');
          if (typeof date !== 'string') return toolError(date.error);
          const item = await findSavedReport(date);
          if (typeof item === 'string') return toolError(item);

          if (formHasContent()) {
            const ok = await context.confirm({
              title: '기록 불러오기',
              description: `${item.month}월 ${item.day}일 보고서를 불러오면 현재 작성 중인 내용이 덮어씌워집니다.`,
              confirmText: '불러오기',
            });
            if (!ok) return toolError('사용자가 불러오기를 취소했습니다.');
          }

          const store = useReportFormStore.getState();
          const finish = beginFormChange(context);
          store.setReportDate({ month: item.month, day: item.day });
          store.setBucket('today', orInitial([...item.todayProjects]));
          store.setBucket('tomorrow', orInitial([...item.tomorrowProjects]));
          finish();
          callbacks.current.onReplaced();
          toast.success(`${item.month}월 ${item.day}일 보고서를 불러왔습니다.`);
          return toolText(currentFormSnapshot());
        },
      },
      {
        name: 'reset_report_form',
        title: '보고서 폼 초기화',
        kind: 'reset',
        description: 'Clear the report form. Saved history is not deleted. Shows a confirmation.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          if (!formHasContent()) return toolText({ changed: false, message: '폼이 이미 비어 있습니다.' });
          const ok = await context.confirm({
            title: '폼 초기화',
            description: '작성 중인 내용이 모두 초기화됩니다. 저장된 기록은 그대로 남습니다.',
            confirmText: '초기화',
            variant: 'danger',
          });
          if (!ok) return toolError('사용자가 초기화를 취소했습니다.');
          const finish = beginFormChange(context);
          useReportFormStore.getState().resetForm();
          finish();
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
          'Download all saved reports as a file. format is "txt" (report texts by date) or "json" (projects, tasks and progress). History is kept. Shows a confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['txt', 'json'], description: 'File format. Defaults to txt' },
          },
        },
        execute: async (input, context) => {
          const format = input.format ?? 'txt';
          if (format !== 'txt' && format !== 'json') return toolError('format 은 "txt" 또는 "json" 이어야 합니다.');
          const items = await useReportHistoryStore.getState().fetchAllHistory();
          if (!items) return toolError('보고서 기록을 불러오지 못했습니다.');
          if (items.length === 0) return toolError('내보낼 기록이 없습니다.');

          const ok = await context.confirm({
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
          'Open the "GitHub에서 가져오기" dialog that imports GitHub commits into today\'s tasks. The user picks and applies commits in the dialog. Members only — guests see a login prompt.',
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
