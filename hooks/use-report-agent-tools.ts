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
  Task,
  WebMcpJsonSchema,
  WebMcpToolResult,
} from '@/types';
import { useAgentChatStore, useAgentHighlightStore, useReportFormStore, useReportHistoryStore } from '@/stores';
import {
  AGENT_CHANGE_PREVIEW_MAX_LINES,
  AGENT_HIGHLIGHT_DATE_ID,
  REPORT_FORM_ACTION_TOOLS,
  REPORT_SCREEN_FEATURE_TOOLS,
} from '@/constants';
import { toolError, toolText, toolUnavailable } from '@/lib/webmcp';
import { useAgentTools } from '.';
import {
  appendProjects,
  areAllAttemptedProjectsValid,
  createEmptyProject,
  createId,
  dayLabel,
  dedupeTasks,
  diffReportForm,
  downloadReportHistory,
  euro,
  findDetail,
  findProject,
  findTasks,
  generateReportText,
  hasProjectContent,
  isSameReportForm,
  mergeIncompleteTasks,
  moveProject,
  moveTask,
  orInitialProjects,
  parseReportText,
  removeProject,
  removeTasks,
  renameProject,
  reportItemDateKey,
  syncProgressFrom,
  updateTasks,
} from '@/utils';

// 검색 결과로 돌려줄 최대 보고서 수 — 에이전트 컨텍스트를 한 번에 넘치게 하지 않을 정도.
const MAX_SEARCH_RESULTS = 62;

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// search_reports 의 query 로 들어오면 무시하는 말 — 기간이나 "보고서" 자체를 가리킬 뿐 프로젝트·작업 키워드가 아니다
const QUERY_STOP_WORDS_REGEX =
  /^(지난\s?주|이번\s?주|저번\s?주|지난\s?달|이번\s?달|저번\s?달|오늘|어제|최근|전체|모두|보고서|기록|업무|요약|정리)(\s*(보고서|기록|업무|요약|정리))*$/;

// 사용자에게 보이는 이름 — "구역"이라는 말은 쓰지 않는다(화면에 없는 말이다)
const BUCKET_LABEL: Record<ProjectsBucket, string> = { today: '금일 업무', tomorrow: '익일 업무' };
const BUCKET_SHORT: Record<ProjectsBucket, string> = { today: '금일', tomorrow: '익일' };

// 채팅 답변 한 문장(AgentTool.summarize)에 넣는 값 — 모델이 준 입력이라 문자열이 아니면 비운다
const quoted = (value: unknown) => (typeof value === 'string' ? `'${value.trim()}'` : '');

// 채팅 후보로 둘 요청 표현(AgentTool.requires) — 요청에 그 대상이 없는데 비슷한 도구를 골랐다
// ("토큰 로그인 작업 삭제해줘"에 그 아래 세부 항목을 지웠고, "이 작업 내일로 옮겨줘"에 금일 전체를 복사했다)
const DETAIL_REQUEST = /세부|하위|소분류|아래에|밑에/;
const INCOMPLETE_REQUEST = /미완료|진행\s*중|안\s*끝|못\s*끝|남은|덜\s*한/;
// 옮기기는 추가 의도에도 후보로 두므로(extraKinds) 옮기라는 말이 있을 때만 — "내일 할 일에도 넣어줘"에 복사 대신 옮겼다
const MOVE_REQUEST = /옮겨|옮기|이동|순서|보내|위로|아래로|맨\s*(앞|위|뒤|아래)|\d+\s*번째/;
// "프로젝트"만 말하고 "작업"은 말하지 않았으면 프로젝트 단위 요청이다 — "사내 위키 프로젝트는 통째로 내일로 옮겨줘"에
// 작업 하나만 옮겼고, "프로젝트는 삭제해줘"에 작업을 지웠다
const PROJECT_REQUEST = /프로젝트/;
// 지우는 도구는 지우라는 말이 있을 때만 — "진행률도 똑같이 해줘"에 작업 삭제를 골랐다
const DELETE_REQUEST = /삭제|지워|지우|빼|없애|제거|날려|치워/;
const isProjectOnly = (request: string) => PROJECT_REQUEST.test(request) && !/작업|업무/.test(request);
const ALL_TODAY_REQUEST = /오늘\s*(한|했던|의)?\s*(업무|작업|일)|금일\s*(업무|작업)|전부|모두|그대로|반복|매일|똑같이/;

// ───────────── 에이전트에게 보여주는 형태 ─────────────
// 내부 id 는 빼고 내용만 넘긴다. 쓰기 도구는 항목을 이름으로 가리키므로 id 로 항목을 가리킬 일이 없다.

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
  savedAt: item.timestamp,
});

const pad2 = (n: number) => String(n).padStart(2, '0');

// 세부 항목을 이름으로 찾되, 못 찾았고 대화에서 방금 다룬 세부 항목(focus)이 이 작업 아래에 있으면 그 줄로 본다 —
// 고친 직후 "방금 고친 세부 항목 지워줘"에 모델이 앞 호출의 옛 문구를 그대로 넣어 매번 실패했다
const findDetailOrFocused = (task: Task, detail: string): number | string => {
  const index = findDetail(task, detail);
  if (typeof index !== 'string') return index;
  const focused = useAgentChatStore.getState().focus.task;
  if (!focused?.detail || focused.task.trim() !== task.content.trim()) return index;
  const again = findDetail(task, focused.detail);
  return typeof again === 'string' ? index : again;
};

// 기록을 저장(복사)한 시각 — "언제 저장했어?"·"몇 시에 썼어?"에 답할 수 있게
const savedAtLabel = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// ───────────── 개수 ─────────────
// "몇 개"를 묻는 질문에 쓰도록 도구가 미리 센다 — 작은 모델은 목록을 직접 세지 못했다(지난주 작업 수를 묻자 날짜 수를 답하고
// 작업 대신 프로젝트를 늘어놓았다). 결과가 길면 뒤가 잘리므로 결과 맨 앞(counts)에 문장으로 둔다.

const countTasks = (projects: ReadonlyArray<AgentProject>) => {
  const tasks = projects.flatMap((p) => p.tasks);
  return { projects: projects.length, tasks: tasks.length, completed: tasks.filter((t) => t.progress === 100).length };
};

const formCounts = (today: ReadonlyArray<AgentProject>, tomorrow: ReadonlyArray<AgentProject>) =>
  (
    [
      ['금일', today],
      ['익일', tomorrow],
    ] as const
  )
    .map(([label, projects]) => {
      const c = countTasks(projects);
      return `${label} 프로젝트 ${c.projects}개 · 작업 ${c.tasks}개(100% 완료 ${c.completed}개)`;
    })
    .join(' / ');

// 여러 날을 합친 개수 — 같은 작업을 날마다 이어 적으므로 같은 작업(프로젝트+작업 내용)을 한 번만 센 개수와 날짜별로 센 건수를 함께 준다
const periodCounts = (reports: ReadonlyArray<{ today: Array<AgentProject>; tomorrow: Array<AgentProject> }>) => {
  const section = (bucket: ProjectsBucket) => {
    const projects = new Set<string>();
    const tasks = new Map<string, number>();
    for (const report of reports)
      for (const p of report[bucket]) {
        projects.add(p.name.trim());
        for (const t of p.tasks) {
          const key = `${p.name.trim()}\n${t.content.trim()}`;
          tasks.set(key, Math.max(tasks.get(key) ?? 0, t.progress));
        }
      }
    const entries = reports.reduce((n, r) => n + countTasks(r[bucket]).tasks, 0);
    const completed = [...tasks.values()].filter((progress) => progress === 100).length;
    return `프로젝트 ${projects.size}개 · 작업 ${tasks.size}개(같은 작업은 한 번만 셈, 100% 완료 ${completed}개, 날짜별로 따로 세면 ${entries}건)`;
  };
  return `보고서 ${reports.length}일 · 금일(한 일) ${section('today')} · 익일(예정) ${section('tomorrow')}`;
};

type AgentReport = ReturnType<typeof toAgentReport>;

// ───────────── 여러 날 결과 ─────────────
// 프로젝트·작업을 JSON 객체로 넘기면 글자 대부분이 키 이름이라, 한 주만 넘어도 채팅에 넘기는 결과(6,000자)가 잘려 뒤 날짜가 빠졌다.
// 그래서 여러 날은 ① 작업별 흐름(같은 작업을 날마다 이어 적으므로 요약에 가장 쓸모 있다)을 먼저 두고 ② 날짜마다 한 줄로 준다.

const compactProjects = (projects: ReadonlyArray<AgentProject>) =>
  projects
    .map(
      (p) =>
        `[${p.name}] ${p.tasks
          .map((t) => `${t.content} ${t.progress}%${t.details.length > 0 ? ` (세부: ${t.details.join('; ')})` : ''}`)
          .join(', ')}`
    )
    .join(' ') || '없음';

const compactDay = (report: AgentReport) =>
  `${report.date} ${dayLabel(report.date)} 금일(작업 ${countTasks(report.today).tasks}개): ${compactProjects(report.today)} / 익일(작업 ${countTasks(report.tomorrow).tasks}개): ${compactProjects(report.tomorrow)}`;

// 기간 안의 금일 작업을 작업별로 — 며칠 했는지, 진행률이 어떻게 변했는지. reports 는 날짜 오름차순
const taskTimeline = (reports: ReadonlyArray<AgentReport>) => {
  const tasks = new Map<string, { project: string; task: string; dates: Array<string>; first: number; last: number }>();
  for (const report of reports)
    for (const p of report.today)
      for (const t of p.tasks) {
        const key = `${p.name.trim()}\n${t.content.trim()}`;
        const entry = tasks.get(key) ?? {
          project: p.name.trim(),
          task: t.content.trim(),
          dates: [],
          first: t.progress,
          last: t.progress,
        };
        entry.dates.push(report.date);
        entry.last = t.progress;
        tasks.set(key, entry);
      }
  return [...tasks.values()].map(
    (e) =>
      `[${e.project}] ${e.task}: ${e.dates.length}일(${dayLabel(e.dates[0])}${e.dates.length > 1 ? `~${dayLabel(e.dates.at(-1)!)}` : ''}), 진행률 ${e.first === e.last ? `${e.last}%` : `${e.first}%→${e.last}%`}`
  );
};

const periodResult = (reports: ReadonlyArray<AgentReport>, extra: Record<string, unknown> = {}) => {
  const shown = reports.slice(-MAX_SEARCH_RESULTS);
  return toolText({
    counts: periodCounts(reports),
    total: reports.length,
    ...extra,
    truncated: reports.length > MAX_SEARCH_RESULTS,
    tasks: taskTimeline(shown),
    days: shown.map(compactDay),
  });
};

const isSavable = (today: ReadonlyArray<Project>, tomorrow: ReadonlyArray<Project>) =>
  (today.some(hasProjectContent) || tomorrow.some(hasProjectContent)) &&
  areAllAttemptedProjectsValid(today) &&
  areAllAttemptedProjectsValid(tomorrow);

const currentFormSnapshot = () => {
  const { reportDate, today, tomorrow } = useReportFormStore.getState();
  const agentToday = toAgentProjects(today);
  const agentTomorrow = toAgentProjects(tomorrow);
  return {
    counts: formCounts(agentToday, agentTomorrow),
    month: Number(reportDate.month),
    day: Number(reportDate.day),
    today: agentToday,
    tomorrow: agentTomorrow,
    canSave: isSavable(today, tomorrow),
    text: generateReportText({ ...reportDate, todayProjects: today, tomorrowProjects: tomorrow }),
  };
};

// 채팅이 쓰기 도구의 입력을 만들 때 보는 지금 폼(AgentTool.inputContext) — 완성 텍스트 등은 빼 토큰을 아낀다.
// 중복 작업이 있으면 따로 짚어 준다 — 작은 모델은 목록에서 같은 줄 둘을 잘 알아보지 못한다.
const currentFormState = () => {
  const { month, day, today, tomorrow } = currentFormSnapshot();
  const duplicates = (['today', 'tomorrow'] as const).flatMap((section) =>
    useReportFormStore.getState()[section].flatMap((p) =>
      p.tasks
        .map((t) => t.content.trim())
        .filter((c, i, all) => c !== '' && all.indexOf(c) !== i)
        .map((task) => ({ section, project: p.name, task }))
    )
  );
  return { report: { month, day, today, tomorrow }, ...(duplicates.length > 0 ? { duplicates } : {}) };
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
      if (!isProgress(progress)) return `${tat}.progress 는 0~100 정수여야 합니다.`;
      const details = task.details ?? [];
      if (!Array.isArray(details) || details.some((d) => typeof d !== 'string'))
        return `${tat}.details 는 문자열 배열이어야 합니다.`;
      tasks.push({
        id: createId(),
        content: task.content.trim(),
        progress,
        details: toDetails(details as Array<string>),
      });
    }
    projects.push({ id: createId(), name: raw.name.trim(), tasks });
  }
  return projects;
};

const isProgress = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;

const toDetails = (lines: ReadonlyArray<string>) =>
  lines
    .map((d) => d.trim())
    .filter((d) => d !== '')
    .map((content) => ({ id: createId(), content }));

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

const parseSectionInput = (value: unknown): ProjectsBucket | null =>
  value === 'today' || value === 'tomorrow' ? value : null;

const parseTextInput = (value: unknown, field: string): string | { error: string } =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : { error: `${field} 는 비어 있지 않은 문자열이어야 합니다.` };

// position 은 1부터 센다. 없으면 맨 뒤.
const parsePositionInput = (value: unknown): number | undefined | { error: string } => {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    return { error: 'position 은 1 이상의 정수여야 합니다.' };
  return value;
};

// 없는 날짜를 물었을 때 함께 알려 줄 가까운 저장 날짜 수
const NEAREST_REPORT_DATES = 3;

// 보고서 기록 store 를 적재한다 — 홈이 아닌 화면으로 바로 들어오면 아직 적재 전(mode: 'loading')이다. 적재는 한 번만 돈다(Promise 캐시).
const ensureHistory = () => useReportHistoryStore.getState().initialize();

const monthDay = (date: string) => `${parseInt(date.slice(5, 7), 10)}월 ${parseInt(date.slice(8, 10), 10)}일`;

// 저장된 보고서 한 건을 찾는다. 로그인 사용자는 월 단위로 lazy 적재하므로 해당 월을 먼저 불러온다 (게스트는 no-op).
// 없는 날짜면 가까운 저장 날짜를 골라 그 보고서로 할지 되묻는다(verb: "볼까요"·"불러올까요") — 오류만 돌려주면 모델이 아무 날짜나 다시 골랐다.
const findSavedReport = async (date: string, verb: string): Promise<ReportHistoryItem | WebMcpToolResult> => {
  await ensureHistory();
  const store = useReportHistoryStore.getState();
  if (!store.allReportDates.includes(date)) {
    const nearest = [...store.allReportDates]
      .sort((a, b) => Math.abs(Date.parse(a) - Date.parse(date)) - Math.abs(Date.parse(b) - Date.parse(date)))
      .slice(0, NEAREST_REPORT_DATES)
      .sort();
    return nearest.length > 0
      ? toolUnavailable({
          reason: `${monthDay(date)}에 저장된 보고서가 없어요.`,
          offer: `가까운 ${nearest.map(monthDay).join(' · ')} 중 하나를 ${verb}?`,
        })
      : toolError('저장된 보고서가 하나도 없어요.');
  }
  await store.loadMonth(parseInt(date.slice(0, 4), 10), parseInt(date.slice(5, 7), 10));
  const item = useReportHistoryStore.getState().history.find((i) => reportItemDateKey(i) === date);
  return item ?? toolError(`${monthDay(date)} 보고서를 불러오지 못했어요.`);
};
const isToolResult = (value: ReportHistoryItem | WebMcpToolResult): value is WebMcpToolResult => 'content' in value;

// 한 작업을 가리키는 입력(section · task · project?)을 풀어 찾는다
const resolveTaskInput = (input: Record<string, unknown>) => {
  const section = parseSectionInput(input.section);
  if (!section) return '"section" 은 "today" 또는 "tomorrow" 여야 합니다.';
  const task = parseTextInput(input.task, 'task');
  if (typeof task !== 'string') return task.error;
  const store = useReportFormStore.getState();
  const projects = store[section];
  const refs = findTasks(projects, input.project, task);
  if (typeof refs !== 'string') return { section, projects, refs };
  // 그 구역에 없고 다른 구역에만 있으면 그쪽 작업이다 — "이 작업 내일로 옮겨줘"에 지금 구역 대신 옮길 구역(tomorrow)을 넣었다
  const other: ProjectsBucket = section === 'today' ? 'tomorrow' : 'today';
  const otherRefs = findTasks(store[other], input.project, task);
  if (typeof otherRefs !== 'string') return { section: other, projects: store[other], refs: otherRefs };
  // 빈 구역을 고치려 했다면 새로 넣는 요청이다 — "익일 업무를 '배포 준비' 하나로 바꿔줘"에 빈 익일에서 작업 이름 바꾸기를 골랐다
  if (!projects.some(hasProjectContent))
    return `${BUCKET_LABEL[section]}가 비어 있어 고칠 작업이 없습니다. 여기에 새로 넣으려면 replace_report_section 이나 add_report_tasks 를 쓰세요.`;
  return refs;
};

// 세부 항목 하나 — 받은 작업 아래에서 찾고, 없으면 구역(→ 다른 구역)에서 그 문구와 똑같은 세부 항목이 하나뿐일 때 그 줄로 본다.
// 모델이 세부 항목이 없는 다른 작업명을 넣어 "찾지 못했습니다"로 끝나곤 했다(세부 항목 문구는 맞았다)
const resolveDetailInput = (input: Record<string, unknown>, detail: string) => {
  const target = resolveTaskInput(input);
  let failure = typeof target === 'string' ? target : null;
  if (typeof target !== 'string') {
    const ref = target.refs[0];
    const index = findDetailOrFocused(target.projects[ref.projectIndex].tasks[ref.taskIndex], detail);
    if (typeof index !== 'string') return { section: target.section, projects: target.projects, ref, index };
    failure = index;
  }
  const store = useReportFormStore.getState();
  const first = parseSectionInput(input.section) ?? 'today';
  const sections: Array<ProjectsBucket> = first === 'today' ? ['today', 'tomorrow'] : ['tomorrow', 'today'];
  // 받은 문구로 못 찾으면 대화에서 방금 다룬 세부 항목으로도 찾는다("방금 고친 세부 항목 지워줘")
  const texts = [detail, useAgentChatStore.getState().focus.task?.detail].filter((t): t is string => !!t);
  for (const text of texts)
    for (const section of sections) {
      const hits = store[section].flatMap((p, projectIndex) =>
        p.tasks.flatMap((t, taskIndex) => {
          const index = t.details.findIndex((d) => d.content.trim() === text.trim());
          return index === -1 ? [] : [{ ref: { projectIndex, taskIndex }, index }];
        })
      );
      if (hits.length === 1) return { section, projects: store[section], ...hits[0] };
      if (hits.length > 1) break;
    }
  return failure ?? '세부 항목을 찾지 못했습니다.';
};

// ───────────── 폼 변경 ─────────────

const formSnapshot = (): ReportFormSnapshot => {
  const { reportDate, today, tomorrow } = useReportFormStore.getState();
  return { reportDate, today, tomorrow };
};

type FormPatch = Partial<ReportFormSnapshot>;

type ChangeConfirm = {
  // removal — 지금 적힌 항목이 사라질 때만 묻는다 · always — 늘 묻는다
  when: 'removal' | 'always';
  title: string;
  intro: string;
  confirmText: string;
  danger?: boolean;
};

type ApplyResult =
  | { status: 'applied'; lines: ReadonlyArray<string> }
  | { status: 'unchanged' | 'cancelled' | 'stale' };

const previewLines = (lines: ReadonlyArray<string>) =>
  [
    ...lines.slice(0, AGENT_CHANGE_PREVIEW_MAX_LINES),
    ...(lines.length > AGENT_CHANGE_PREVIEW_MAX_LINES
      ? [`…외 ${lines.length - AGENT_CHANGE_PREVIEW_MAX_LINES}건`]
      : []),
  ].join('\n');

// 모든 폼 변경이 지나는 한 경로 — 바꾼 결과를 먼저 만들어 실제 변경 줄을 계산하고, 필요하면 **그 줄을 보여 주며** 확인을 받은 뒤
// 적용한다. 확인 카드가 "내용이 모두 초기화됩니다" 같은 고정 문구뿐이라, 중복 삭제 요청에 폼 전체가 지워지는 걸 보고도 승인했다.
// 적용하면 바뀐 칸을 강조하고(WebMCP 로 불러도) 채팅에는 변경 카드용 줄과 되돌리기를 넘긴다.
// 되돌리기는 바꾼 뒤 그대로일 때만 한다(그사이 사용자가 고쳤으면 덮어쓰지 않는다).
const applyFormChange = async (
  context: AgentToolContext,
  patch: FormPatch,
  {
    confirm,
    success,
    moved,
  }: Readonly<{
    confirm?: ChangeConfirm;
    success: string;
    // 순서만 바꾼 항목의 id — 순서 비교만으로는 맞바꾼 둘 중 어느 쪽을 옮겼는지 알 수 없어 옮긴 도구가 알려 준다
    moved?: string;
  }>
): Promise<ApplyResult> => {
  const before = formSnapshot();
  const after: ReportFormSnapshot = { ...before, ...patch };
  const diff = diffReportForm(before, after);
  const { lines, dateChanged } = diff;
  const orderOnly = lines.length > 0 && lines.every((line) => line.startsWith('↕'));
  const changedIds = orderOnly && moved ? [moved] : diff.changedIds;
  if (lines.length === 0) return { status: 'unchanged' };

  if (confirm && (confirm.when === 'always' || lines.some((line) => line.startsWith('－')))) {
    const ok = await context.confirm({
      title: confirm.title,
      description: `${confirm.intro}\n\n${previewLines(lines)}`,
      confirmText: confirm.confirmText,
      variant: confirm.danger ? 'danger' : 'default',
    });
    if (!ok) return { status: 'cancelled' };
    // 확인을 기다리는 사이 폼이 바뀌었으면(WebMCP 로 부르면 본문이 잠기지 않는다) 계산해 둔 결과로 덮어쓰지 않는다
    if (!isSameReportForm(formSnapshot(), before)) return { status: 'stale' };
  }

  const store = useReportFormStore.getState();
  if (patch.reportDate) store.setReportDate(patch.reportDate);
  if (patch.today) store.setBucket('today', [...patch.today]);
  if (patch.tomorrow) store.setBucket('tomorrow', [...patch.tomorrow]);

  const { flash } = useAgentHighlightStore.getState();
  flash([...changedIds, ...(dateChanged ? [AGENT_HIGHLIGHT_DATE_ID] : [])]);
  const applied = formSnapshot();
  context.reportChange?.({
    lines,
    undo: () => {
      if (!isSameReportForm(formSnapshot(), applied)) return false;
      const current = useReportFormStore.getState();
      current.setReportDate(before.reportDate);
      current.setBucket('today', [...before.today]);
      current.setBucket('tomorrow', [...before.tomorrow]);
      const restored = diffReportForm(applied, before);
      const restoredIds = orderOnly && moved ? [moved] : restored.changedIds;
      flash([...restoredIds, ...(restored.dateChanged ? [AGENT_HIGHLIGHT_DATE_ID] : [])]);
      return true;
    },
  });
  toast.success(success);
  return { status: 'applied', lines };
};

// 변경 결과를 도구 결과로. 바뀐 줄(changes)을 함께 돌려줘 채팅·외부 에이전트가 실제로 바뀐 것을 알 수 있게 한다.
const changeResult = (result: ApplyResult, unchanged: string): WebMcpToolResult => {
  switch (result.status) {
    case 'applied':
      return toolText({ changed: true, changes: result.lines, ...currentFormSnapshot() });
    case 'unchanged':
      return toolText({ changed: false, message: unchanged });
    case 'cancelled':
      return toolError('사용자가 취소했습니다.');
    case 'stale':
      return toolError('확인하는 사이 폼 내용이 바뀌어 적용하지 않았습니다. 지금 상태를 보고 다시 시도하세요.');
  }
};

// ───────────── 스키마 ─────────────

const SECTION_SCHEMA: WebMcpJsonSchema = {
  type: 'string',
  enum: ['today', 'tomorrow'],
  description:
    'today = 금일 업무 진행 현황 (work done today), tomorrow = 익일 업무 진행 예정 (work planned for tomorrow)',
};

const TASK_SCHEMA: WebMcpJsonSchema = { type: 'string', description: 'Task text exactly as in the current state' };
const PROJECT_REF_SCHEMA: WebMcpJsonSchema = {
  type: 'string',
  description: 'Project name exactly as in the current state, if known',
};
const POSITION_SCHEMA: WebMcpJsonSchema = {
  type: 'integer',
  minimum: 1,
  description: 'Position counted from 1 (1 = first). Omit to put it last',
};

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

// 저장된 보고서 기록 조회 — 작성 중인 폼과 관계없어 (app) 어느 화면에서나 쓴다(useHistoryAgentTools).
// 보고서 화면에만 두었을 때는 새소식 화면에서 "지난주 보고서 요약해줘"에 새소식 목록으로 대신했다.
const createHistoryAgentTools = (): Array<AgentTool> => [
  {
    name: 'list_report_dates',
    title: '저장된 보고서 날짜 조회',
    kind: 'read',
    description:
      'Return only the dates (YYYY-MM-DD, newest first) that have saved reports — no content — with the total and the number of reports per month (byMonth). Use it to know which dates have records or how many reports were written. To view or summarize content, use search_reports (range/keyword) or get_report (one day).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      await ensureHistory();
      const { mode, allReportDates } = useReportHistoryStore.getState();
      // "이번 달에 보고서 몇 번 썼어?" — 모델이 날짜 목록을 직접 세지 않게 월별로 세어 준다
      const byMonth: Record<string, number> = {};
      for (const date of allReportDates) byMonth[date.slice(0, 7)] = (byMonth[date.slice(0, 7)] ?? 0) + 1;
      return toolText({
        storage: mode === 'user' ? 'account' : 'browser',
        total: allReportDates.length,
        byMonth,
        dates: allReportDates,
      });
    },
  },
  {
    name: 'get_report',
    title: '저장된 보고서 조회',
    kind: 'read',
    description:
      'Return the saved report for the given date: weekday (day), when it was saved (savedAt), counts, and the today and tomorrow sections with tasks, progress and details.',
    inputSchema: { type: 'object', properties: { date: DATE_KEY_SCHEMA }, required: ['date'] },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    // 지난 보고서를 읽어 준 뒤 그대로 폼에 불러와 이어 쓸 수 있게 버튼을 둔다(불러오기는 확인 카드를 거친다)
    followUp: (input) =>
      typeof input.date === 'string'
        ? {
            ask: '이 보고서를 폼으로 불러올까요?',
            actions: [
              {
                id: `load-report-${input.date}`,
                label: '이 보고서 폼으로 불러오기',
                action: {
                  type: 'tool',
                  tool: 'load_report',
                  title: '저장된 보고서 불러오기',
                  input: { date: input.date },
                },
                needsAi: false,
              },
            ],
          }
        : null,
    execute: async (input) => {
      const date = parseDateKeyInput(input.date, 'date');
      if (typeof date !== 'string') return toolError(date.error);
      const item = await findSavedReport(date, '볼까요');
      if (isToolResult(item)) return item;
      const { savedAt, ...report } = toAgentReport(item);
      return toolText({
        counts: formCounts(report.today, report.tomorrow),
        date: report.date,
        day: dayLabel(report.date),
        savedAt: savedAtLabel(savedAt),
        today: report.today,
        tomorrow: report.tomorrow,
      });
    },
  },
  {
    name: 'search_reports',
    title: '보고서 기록 검색',
    kind: 'read',
    description:
      'Search saved report contents by date range (from~to, inclusive) and keyword. Use it to view or summarize several days, e.g. "summarize this week" or "find last month\'s token tasks". With a keyword, only projects whose name, tasks or details contain it are kept. The result has counts (projects and tasks already counted for the period — use them for "how many" questions), tasks (each task done in the period: how many days, first~last day, progress change) and days (one line per report in ascending date order with weekday, up to the latest 62 reports).',
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

      await ensureHistory();
      const all = await useReportHistoryStore.getState().fetchAllHistory();
      if (!all) return toolError('보고서 기록을 불러오지 못했습니다.');

      const matchesQuery = (p: AgentProject) =>
        [p.name, ...p.tasks.flatMap((t) => [t.content, ...t.details])].some((s) => s.toLowerCase().includes(query));

      const inPeriod = all
        .map(toAgentReport)
        .filter((r) => (from === null || r.date >= from) && (to === null || r.date <= to))
        .sort((a, b) => a.date.localeCompare(b.date));
      const reports = inPeriod
        .map((r) =>
          query ? { ...r, today: r.today.filter(matchesQuery), tomorrow: r.tomorrow.filter(matchesQuery) } : r
        )
        .filter((r) => !query || r.today.length > 0 || r.tomorrow.length > 0);

      // 키워드로 하나도 안 나오면 기간 전체를 돌려준다 — "query 를 빼고 다시 부르라"고 알려도 모델이 같은 호출을 되풀이했다
      if (query && reports.length === 0 && inPeriod.length > 0)
        return periodResult(inPeriod, {
          note: `"${rawQuery}" 와 일치하는 프로젝트가 없어 기간 안의 보고서 전체를 돌려줍니다.`,
        });

      return periodResult(reports);
    },
  },
];

// 보고서 기록 조회 도구를 전역으로 등록한다((app) 레이아웃의 AgentAssistant)
export const useHistoryAgentTools = () => useAgentTools(createHistoryAgentTools, true);

// 개발 모드에서 대응표(REPORT_FORM_ACTION_TOOLS·REPORT_SCREEN_FEATURE_TOOLS)가 가리키는 도구가 실제로 있는지 확인한다 —
// 표는 타입으로 빠짐없이 채우게 강제하지만, 도구 이름 오타·삭제는 실행해 봐야 안다.
const checkToolCoverage = (tools: ReadonlyArray<AgentTool>) => {
  const names = new Set(tools.map((t) => t.name));
  const missing = [...Object.values(REPORT_FORM_ACTION_TOOLS), ...Object.values(REPORT_SCREEN_FEATURE_TOOLS)]
    .flatMap((entry) => ('tools' in entry ? entry.tools : []))
    .filter((name) => !names.has(name));
  if (missing.length > 0) console.error('[agent-tools] 대응표에 있지만 등록되지 않은 도구:', [...new Set(missing)]);
};

type Options = {
  // 폼이 기록 hydration 까지 끝나 편집 가능한 상태일 때만 도구를 노출한다.
  // 그 전에 채우면 hydration(오늘 기록 복원 / 익일 carry-over)이 에이전트 입력을 덮어쓴다.
  enabled: boolean;
  // save_report 로 기록에 저장된 직후 — 이탈 경고 baseline 갱신, 캘린더 이동, 커밋 보정 메모리 학습 등 폼 쪽 후처리.
  onSaved: (date: ReportDate) => void;
  // load_report / reset_report_form 으로 폼을 통째로 바꾼 직후 — 이탈 경고 baseline 갱신
  onReplaced: () => void;
  // GitHub 커밋 가져오기 다이얼로그 열기 (조회 범위 계산은 폼이 한다)
  onOpenGithubImport: () => void;
  // "복사하기" 버튼과 같은 동작(클립보드 복사 + 기록 저장). 성공하면 true
  onCopy: () => Promise<boolean>;
};

// 보고서 작성 화면의 기능을 에이전트 도구로 노출한다 (WebMCP + 앱 안 채팅, `useAgentTools`).
// 도구는 DOM 을 거치지 않고 store 액션을 직접 호출하므로, 에이전트의 변경도 사용자 입력과 똑같이 화면에 반영된다.
// 화면에서 할 수 있는 일은 모두 도구가 있거나, 대응표(constants/agent-tool-coverage.constants.ts)에 빼는 이유가 있어야 한다.
export const useReportAgentTools = ({
  enabled,
  onSaved,
  onReplaced,
  onOpenGithubImport,
  onCopy,
}: Readonly<Options>) => {
  // 도구는 등록 시점에 한 번 만들어지므로, 실행 시점의 최신 콜백을 ref 로 읽는다
  const callbacks = useRef({ onSaved, onReplaced, onOpenGithubImport, onCopy });
  useEffect(() => {
    callbacks.current = { onSaved, onReplaced, onOpenGithubImport, onCopy };
  });

  useAgentTools((): Array<AgentTool> => {
    const tools: Array<AgentTool> = [
      // ───────────── 조회 ─────────────
      {
        name: 'get_current_report',
        title: '작성 중인 보고서 확인',
        kind: 'read',
        stateReader: true,
        description:
          'Return the daily report form currently being written: report date (month/day), today, tomorrow, whether it can be saved (canSave), the finished report text (text) and counts (projects and tasks already counted per section — use them for "how many" questions). Call it to check the current state before editing.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => toolText(currentFormSnapshot()),
      },

      // ───────────── 추가 ─────────────
      {
        name: 'add_report_tasks',
        title: '보고서에 작업 추가',
        kind: 'add',
        description:
          "Append one project and its tasks to one section of the report form. If a project with the same name exists, the tasks are added under it; otherwise a new project is created. A task with the same text that already exists is not added twice — its progress is updated instead. Existing content is kept. To bring today's tasks over to tomorrow, use copy_today_to_tomorrow or carry_over_incomplete_tasks instead.",
        inputContext: currentFormState,
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
          // 이 구역의 다른 프로젝트에 이미 있는 작업은 넣지 않는다 — "API 연동 추가해줘"에 지금 폼의 작업을 베껴 넣었다
          const current = useReportFormStore.getState()[section];
          const elsewhere = new Set(
            current.filter((p) => p.name.trim() !== parsed[0].name).flatMap((p) => p.tasks.map((t) => t.content.trim()))
          );
          // 채팅이면 사용자가 말했거나 지금 폼에 있는 작업만 넣는다 — 대화 앞부분에서 지운 작업을 다시 가져와 넣었다
          const store = useReportFormStore.getState();
          const inForm = new Set(
            [...store.today, ...store.tomorrow].flatMap((p) => p.tasks.map((t) => t.content.trim()))
          );
          const mentioned = (content: string) => {
            if (!context.request) return true;
            const request = context.request.replace(/\s+/g, '');
            const words = content.split(/\s+/).filter((w) => w.length > 1);
            return (
              request.includes(content.replace(/\s+/g, '')) ||
              words.filter((w) => request.includes(w)).length * 2 >= words.length
            );
          };
          const invented = parsed[0].tasks.filter((t) => !inForm.has(t.content) && !mentioned(t.content));
          if (invented.length > 0)
            return toolError(
              `요청에도 지금 폼에도 없는 작업입니다: ${invented.map((t) => t.content).join(', ')}. 사용자가 이번에 말한 작업이나 지금 폼에 있는 작업만 넣으세요. 금일 작업을 익일로 옮기려면 copy_today_to_tomorrow 를 쓰세요.`
            );
          let fresh = parsed[0].tasks.filter((t) => !elsewhere.has(t.content));
          let target = parsed[0];
          // 작업 이름을 프로젝트 칸에 넣고 작업 칸에는 지금 있는 작업을 베껴 넣는 실수가 잦다 —
          // "금일 업무에 'API 연동' 작업을 70%로 추가해줘"에 project "API 연동" + 기존 작업들. 그 이름이 새 이름이고 요청에 있고
          // 이 구역에 프로젝트가 하나뿐이면 그 프로젝트에 그 이름의 작업을 넣는다(진행률은 요청의 % 로)
          const named = current.filter((p) => p.name.trim() !== '');
          if (
            fresh.length === 0 &&
            context.request?.includes(target.name) &&
            !named.some((p) => p.name.trim() === target.name) &&
            named.length === 1
          ) {
            const percent = /(\d{1,3})\s*%/.exec(context.request)?.[1];
            const progress = percent ? Math.min(100, Number(percent)) : 0;
            const task = { id: createId(), content: target.name, progress, details: [] };
            target = { ...target, name: named[0].name, tasks: [task] };
            fresh = target.tasks;
          }
          if (fresh.length === 0)
            return toolError(
              '이미 같은 업무의 다른 프로젝트에 있는 작업만 들어 있습니다. 사용자가 말한 새 작업만 넣어 다시 부르세요.'
            );
          const projects = appendProjects(current, [{ ...target, tasks: fresh }]);
          return changeResult(
            await applyFormChange(
              context,
              { [section]: projects },
              { success: `에이전트가 ${BUCKET_LABEL[section]}에 작업을 추가했습니다.` }
            ),
            '이미 같은 작업이 같은 진행률로 있습니다.'
          );
        },
      },
      {
        name: 'add_task_details',
        title: '세부 항목 추가',
        kind: 'add',
        requires: (request) => DETAIL_REQUEST.test(request),
        description:
          'Add detail lines (세부 항목, no progress) under an existing task (세부 항목 추가, 아래에 적어줘). Lines already there are skipped.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            task: TASK_SCHEMA,
            details: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Detail lines to add' },
            project: PROJECT_REF_SCHEMA,
          },
          required: ['section', 'task', 'details'],
        },
        execute: async (input, context) => {
          const target = resolveTaskInput(input);
          if (typeof target === 'string') return toolError(target);
          if (!Array.isArray(input.details) || input.details.some((d) => typeof d !== 'string'))
            return toolError('details 는 문자열 배열이어야 합니다.');
          const lines = toDetails(input.details as Array<string>);
          const projects = updateTasks(target.projects, target.refs, (t) => ({
            ...t,
            details: [...t.details, ...lines.filter((d) => !t.details.some((td) => td.content.trim() === d.content))],
          }));
          return changeResult(
            await applyFormChange(
              context,
              { [target.section]: projects },
              { success: '에이전트가 세부 항목을 추가했습니다.' }
            ),
            '이미 같은 세부 항목이 있습니다.'
          );
        },
      },
      {
        name: 'carry_over_incomplete_tasks',
        title: '미완료 업무 익일로 가져오기',
        kind: 'add',
        requires: (request) => INCOMPLETE_REQUEST.test(request),
        description:
          "Copy only today's unfinished tasks (under 100% progress) to tomorrow. Tasks are added under projects with the same name; tasks already there are skipped. To repeat today's work tomorrow regardless of progress, use copy_today_to_tomorrow.",
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const { today, tomorrow } = useReportFormStore.getState();
          const merged = mergeIncompleteTasks(today, tomorrow);
          if (!merged)
            return toolText({
              changed: false,
              message:
                '가져올 새로운 미완료 작업이 없습니다. 완료한 작업까지 옮기려면 "오늘 업무를 내일에도 그대로 넣어줘"라고 해 주세요.',
            });
          return changeResult(
            await applyFormChange(
              context,
              { tomorrow: merged },
              { success: '에이전트가 미완료 업무를 익일로 가져왔습니다.' }
            ),
            '가져올 새로운 미완료 작업이 없습니다.'
          );
        },
      },
      {
        // 반복 업무(예: 24시간 모니터링)는 오늘 100% 여도 내일 또 한다 — 이 도구가 없을 때 Nano 가 add_report_tasks 로
        // 프로젝트명·작업명을 지어내(요청 문장을 작업명으로) 넣었다
        name: 'copy_today_to_tomorrow',
        title: '금일 업무 익일로 복사',
        kind: 'add',
        requires: (request) => ALL_TODAY_REQUEST.test(request),
        // "진행률도 똑같이 해줘"(복사 뒤 후속)는 수정으로 분류된다 — 금일 진행률을 그대로 맞추는 이 도구가 정답이다
        extraKinds: ['edit'],
        description:
          "Copy all of today's tasks, including completed ones, to tomorrow — for work the user will do again tomorrow (오늘 한 업무 내일도 그대로, 반복 업무). keep_progress=true keeps today's progress (진행률도 그대로, 똑같이) and also sets tasks already copied to tomorrow to today's progress; otherwise completed tasks start at 0% tomorrow. Tasks already in tomorrow are not added twice.",
        inputSchema: {
          type: 'object',
          properties: {
            keep_progress: {
              type: 'boolean',
              description: "true only if the user asked to keep today's progress as it is",
            },
          },
        },
        execute: async (input, context) => {
          const { today, tomorrow } = useReportFormStore.getState();
          const keepProgress = input.keep_progress === true;
          const copied = mergeIncompleteTasks(today, tomorrow, { includeCompleted: true, keepProgress });
          // 진행률을 그대로 두라면 이미 익일에 있는 같은 작업의 진행률도 금일에 맞춘다 — 복사한 뒤 "진행률도 똑같이 해줘"
          const merged = keepProgress ? (syncProgressFrom(today, copied ?? tomorrow) ?? copied) : copied;
          if (!merged)
            return toolText({ changed: false, message: '익일로 옮길 금일 작업이 없습니다(이미 모두 들어 있어요).' });
          const result = await applyFormChange(
            context,
            { tomorrow: merged },
            { success: '에이전트가 금일 업무를 익일로 복사했습니다.' }
          );
          if (result.status !== 'applied' || input.keep_progress === true) return changeResult(result, '');
          // 진행률을 0 으로 시작한 줄 모르고 "그대로 복사했다"고 답하지 않게 알린다
          return toolText({
            changed: true,
            changes: result.lines,
            note: '완료(100%)한 작업은 익일 예정이라 진행률 0%로 넣었습니다. 진행률을 바꾸려면 set_task_progress 로 바꿀 수 있습니다.',
            ...currentFormSnapshot(),
          });
        },
      },

      // ───────────── 작은 수정 (edit) ─────────────
      // 작업·프로젝트·세부 항목 하나를 이름으로 가리켜 고친다. 없을 때 Nano 는 구역을 통째로 다시 쓰거나(replace_report_section)
      // 비슷한 도구로 대신했다 — "진행률도 똑같이"에 같은 작업을 하나 더 넣고, "중복 삭제"에 폼 전체를 초기화했다.
      // 사용자가 콕 집은 대상만 바꾸고 변경 카드에서 되돌릴 수 있어 확인을 받지 않는다.
      {
        name: 'set_report_date',
        title: '보고서 날짜 바꾸기',
        kind: 'edit',
        description:
          'Change only the report date (month/day) of the form; content stays. The year is the current year.',
        inputContext: currentFormState,
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
          return changeResult(
            await applyFormChange(
              context,
              { reportDate: date },
              { success: `보고서 날짜를 ${date.month}월 ${date.day}일로 바꿨습니다.` }
            ),
            `이미 ${date.month}월 ${date.day}일입니다.`
          );
        },
      },
      {
        name: 'set_task_progress',
        title: '작업 진행률 바꾸기',
        kind: 'edit',
        description:
          "Change the progress (%) of an existing task (진행률 바꿔줘, 100%로 해줘, 다 했어). Only that task's progress changes; nothing is added.",
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            task: TASK_SCHEMA,
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description:
                'New progress (%). For "the same as today/똑같이", use the progress of the same task in the other section of the current state',
            },
            project: PROJECT_REF_SCHEMA,
          },
          required: ['section', 'task', 'progress'],
        },
        execute: async (input, context) => {
          const target = resolveTaskInput(input);
          if (typeof target === 'string') return toolError(target);
          const { progress } = input;
          if (!isProgress(progress)) return toolError('progress 는 0~100 정수여야 합니다.');
          const projects = updateTasks(target.projects, target.refs, (t) => ({ ...t, progress }));
          // 같은 작업이 다른 구역에 다른 진행률로 있으면 알려 준다 — "진행률도 똑같이"에 익일 대신 금일 작업을 골랐다
          const other = target.section === 'today' ? 'tomorrow' : 'today';
          const elsewhere = findTasks(useReportFormStore.getState()[other], input.project, input.task as string);
          const hint =
            typeof elsewhere !== 'string' &&
            elsewhere.some(
              (r) => useReportFormStore.getState()[other][r.projectIndex].tasks[r.taskIndex].progress !== progress
            )
              ? ` ${BUCKET_LABEL[other]}의 같은 작업을 바꾸려면 section 을 "${other}" 로 다시 부르세요.`
              : '';
          return changeResult(
            await applyFormChange(
              context,
              { [target.section]: projects },
              { success: '에이전트가 작업 진행률을 바꿨습니다.' }
            ),
            `${BUCKET_LABEL[target.section]}의 이 작업은 이미 진행률이 ${progress}% 입니다.${hint}`
          );
        },
      },
      {
        name: 'rename_report_task',
        title: '작업 내용 고치기',
        kind: 'edit',
        description: 'Change the text of an existing task (작업 이름·내용 바꿔줘, 고쳐줘). Progress and details stay.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            task: TASK_SCHEMA,
            new_text: { type: 'string', description: "New task text (keep the user's wording)" },
            project: PROJECT_REF_SCHEMA,
          },
          required: ['section', 'task', 'new_text'],
        },
        execute: async (input, context) => {
          const target = resolveTaskInput(input);
          if (typeof target === 'string') return toolError(target);
          const text = parseTextInput(input.new_text, 'new_text');
          if (typeof text !== 'string') return toolError(text.error);
          const projects = updateTasks(target.projects, target.refs, (t) => ({ ...t, content: text }));
          return changeResult(
            await applyFormChange(
              context,
              { [target.section]: projects },
              { success: '에이전트가 작업 내용을 고쳤습니다.' }
            ),
            '이미 같은 내용입니다.'
          );
        },
      },
      {
        name: 'remove_report_task',
        title: '작업 삭제',
        kind: 'edit',
        requires: (request) => DELETE_REQUEST.test(request) && !isProjectOnly(request),
        description:
          'Delete one task from one section (작업 삭제해줘, 빼줘, 안 했어). Everything else is kept. A project left with no tasks is removed. To merge duplicated tasks, use remove_duplicate_tasks.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: { section: SECTION_SCHEMA, task: TASK_SCHEMA, project: PROJECT_REF_SCHEMA },
          required: ['section', 'task'],
        },
        execute: async (input, context) => {
          const target = resolveTaskInput(input);
          if (typeof target === 'string') return toolError(target);
          return changeResult(
            await applyFormChange(
              context,
              { [target.section]: removeTasks(target.projects, target.refs) },
              { success: `에이전트가 ${BUCKET_LABEL[target.section]}에서 작업을 지웠습니다.` }
            ),
            '지울 작업이 없습니다.'
          );
        },
      },
      {
        name: 'remove_duplicate_tasks',
        title: '중복 작업 정리',
        kind: 'edit',
        summarize: (_input, changes) =>
          `같은 작업 ${changes.filter((line) => line.startsWith('－')).length}개를 하나로 합쳤어요`,
        description:
          'Merge tasks with the same text inside the same project into one (중복 작업 삭제·정리). Keeps the higher progress and all details. Checks both sections.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const { today, tomorrow } = useReportFormStore.getState();
          const patch: FormPatch = {};
          const nextToday = dedupeTasks(today);
          const nextTomorrow = dedupeTasks(tomorrow);
          if (nextToday) patch.today = nextToday;
          if (nextTomorrow) patch.tomorrow = nextTomorrow;
          return changeResult(
            await applyFormChange(context, patch, { success: '에이전트가 중복 작업을 정리했습니다.' }),
            '중복된 작업이 없습니다.'
          );
        },
      },
      {
        name: 'move_report_task',
        title: '작업 옮기기',
        kind: 'edit',
        // "이 작업 내일로 옮겨줘"가 추가(add)로 분류되곤 한다
        extraKinds: ['add'],
        requires: (request) => MOVE_REQUEST.test(request) && !isProjectOnly(request),
        description:
          'Move one task to the other section (금일↔익일), to another project, or to another position (옮겨줘, 순서 바꿔줘). to_project defaults to the same project name in the target section (created if missing). Same task already there is merged.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: { ...SECTION_SCHEMA, description: 'Section the task is in now' },
            task: TASK_SCHEMA,
            to_section: { ...SECTION_SCHEMA, description: 'Section to move to (same as section to stay)' },
            to_project: { type: 'string', description: 'Project to move into. Omit to keep the same project name' },
            position: POSITION_SCHEMA,
            project: PROJECT_REF_SCHEMA,
          },
          required: ['section', 'task', 'to_section'],
        },
        execute: async (input, context) => {
          const target = resolveTaskInput(input);
          if (typeof target === 'string') return toolError(target);
          const toSection = parseSectionInput(input.to_section);
          if (!toSection) return toolError('to_section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const position = parsePositionInput(input.position);
          if (typeof position === 'object') return toolError(position.error);
          const toProject = typeof input.to_project === 'string' ? input.to_project : undefined;
          const { today, tomorrow } = useReportFormStore.getState();
          const ref = target.refs[0];
          const next = moveTask({ today, tomorrow }, target.section, ref, toSection, toProject, position);
          if (typeof next === 'string') return toolError(next);
          return changeResult(
            await applyFormChange(context, next, {
              success: '에이전트가 작업을 옮겼습니다.',
              moved: target.projects[ref.projectIndex].tasks[ref.taskIndex].id,
            }),
            '이미 그 자리에 있습니다.'
          );
        },
      },
      {
        name: 'rename_report_project',
        title: '프로젝트 이름 바꾸기',
        kind: 'edit',
        requires: (request) => PROJECT_REQUEST.test(request),
        summarize: (input) => `프로젝트 이름을 ${quoted(input.project)}에서 ${euro(quoted(input.new_name))} 바꿨어요`,
        description:
          'Change the name of a project (프로젝트 이름 바꿔줘). If a project with the new name already exists in the section, the tasks are merged into it.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            project: { type: 'string', description: 'Current project name exactly as in the current state' },
            new_name: { type: 'string', description: "New project name (keep the user's wording)" },
          },
          required: ['section', 'project', 'new_name'],
        },
        execute: async (input, context) => {
          const section = parseSectionInput(input.section);
          if (!section) return toolError('section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const name = parseTextInput(input.project, 'project');
          const newName = parseTextInput(input.new_name, 'new_name');
          if (typeof name !== 'string') return toolError(name.error);
          if (typeof newName !== 'string') return toolError(newName.error);
          const projects = useReportFormStore.getState()[section];
          const index = findProject(projects, name);
          if (typeof index === 'string') return toolError(index);
          return changeResult(
            await applyFormChange(
              context,
              { [section]: renameProject(projects, index, newName) },
              { success: '에이전트가 프로젝트 이름을 바꿨습니다.' }
            ),
            '이미 같은 이름입니다.'
          );
        },
      },
      {
        name: 'remove_report_project',
        title: '프로젝트 삭제',
        kind: 'edit',
        requires: (request) => DELETE_REQUEST.test(request) && PROJECT_REQUEST.test(request),
        summarize: (input, changes) =>
          `${quoted(input.project)} 프로젝트와 작업 ${changes.filter((line) => !line.includes(' › ')).length}개를 지웠어요`,
        description: 'Delete one whole project and all its tasks from one section (프로젝트 삭제해줘, 통째로 빼줘).',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: { section: SECTION_SCHEMA, project: { type: 'string', description: 'Project name' } },
          required: ['section', 'project'],
        },
        execute: async (input, context) => {
          const section = parseSectionInput(input.section);
          if (!section) return toolError('section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const name = parseTextInput(input.project, 'project');
          if (typeof name !== 'string') return toolError(name.error);
          const projects = useReportFormStore.getState()[section];
          const index = findProject(projects, name);
          if (typeof index === 'string') return toolError(index);
          return changeResult(
            await applyFormChange(
              context,
              { [section]: removeProject(projects, index) },
              { success: `에이전트가 ${BUCKET_LABEL[section]}에서 프로젝트를 지웠습니다.` }
            ),
            '지울 프로젝트가 없습니다.'
          );
        },
      },
      {
        name: 'move_report_project',
        title: '프로젝트 옮기기',
        kind: 'edit',
        summarize: (input) =>
          input.section === input.to_section
            ? `${quoted(input.project)} 프로젝트 순서를 바꿨어요`
            : `${quoted(input.project)} 프로젝트를 ${euro(BUCKET_SHORT[input.to_section === 'today' ? 'today' : 'tomorrow'])} 옮겼어요`,
        extraKinds: ['add'],
        requires: (request) => MOVE_REQUEST.test(request) && PROJECT_REQUEST.test(request),
        description:
          'Move a whole project to the other section (금일↔익일) or to another position in the same section (프로젝트 옮겨줘, 순서 바꿔줘). A project with the same name in the target section is merged.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: { ...SECTION_SCHEMA, description: 'Section the project is in now' },
            project: { type: 'string', description: 'Project name' },
            to_section: { ...SECTION_SCHEMA, description: 'Section to move to (same as section to stay)' },
            position: POSITION_SCHEMA,
          },
          required: ['section', 'project', 'to_section'],
        },
        execute: async (input, context) => {
          const section = parseSectionInput(input.section);
          const toSection = parseSectionInput(input.to_section);
          if (!section || !toSection) return toolError('section·to_section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const name = parseTextInput(input.project, 'project');
          if (typeof name !== 'string') return toolError(name.error);
          const position = parsePositionInput(input.position);
          if (typeof position === 'object') return toolError(position.error);
          const { today, tomorrow } = useReportFormStore.getState();
          const index = findProject({ today, tomorrow }[section], name);
          if (typeof index === 'string') return toolError(index);
          const next = moveProject({ today, tomorrow }, section, index, toSection, position);
          if (typeof next === 'string') return toolError(next);
          return changeResult(
            await applyFormChange(context, next, {
              success: '에이전트가 프로젝트를 옮겼습니다.',
              moved: { today, tomorrow }[section][index].id,
            }),
            '이미 그 자리에 있습니다.'
          );
        },
      },
      {
        name: 'edit_task_detail',
        title: '세부 항목 고치기',
        kind: 'edit',
        requires: (request) => DETAIL_REQUEST.test(request),
        description: 'Change the text of one detail line (세부 항목) under a task.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            task: TASK_SCHEMA,
            detail: { type: 'string', description: 'Current detail text exactly as in the current state' },
            new_text: { type: 'string', description: 'New detail text' },
            project: PROJECT_REF_SCHEMA,
          },
          required: ['section', 'task', 'detail', 'new_text'],
        },
        execute: async (input, context) => {
          const detail = parseTextInput(input.detail, 'detail');
          const text = parseTextInput(input.new_text, 'new_text');
          if (typeof detail !== 'string') return toolError(detail.error);
          if (typeof text !== 'string') return toolError(text.error);
          const target = resolveDetailInput(input, detail);
          if (typeof target === 'string') return toolError(target);
          const projects = updateTasks(target.projects, [target.ref], (t) => ({
            ...t,
            details: t.details.map((d, i) => (i === target.index ? { ...d, content: text } : d)),
          }));
          return changeResult(
            await applyFormChange(
              context,
              { [target.section]: projects },
              { success: '에이전트가 세부 항목을 고쳤습니다.' }
            ),
            '이미 같은 내용입니다.'
          );
        },
      },
      {
        name: 'remove_task_detail',
        title: '세부 항목 삭제',
        kind: 'edit',
        requires: (request) => DELETE_REQUEST.test(request) && DETAIL_REQUEST.test(request),
        description: 'Delete one detail line (세부 항목) under a task. The task stays.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            task: TASK_SCHEMA,
            detail: { type: 'string', description: 'Detail text exactly as in the current state' },
            project: PROJECT_REF_SCHEMA,
          },
          required: ['section', 'task', 'detail'],
        },
        execute: async (input, context) => {
          const detail = parseTextInput(input.detail, 'detail');
          if (typeof detail !== 'string') return toolError(detail.error);
          const target = resolveDetailInput(input, detail);
          if (typeof target === 'string') return toolError(target);
          const projects = updateTasks(target.projects, [target.ref], (t) => ({
            ...t,
            details: t.details.filter((_d, i) => i !== target.index),
          }));
          return changeResult(
            await applyFormChange(
              context,
              { [target.section]: projects },
              { success: '에이전트가 세부 항목을 지웠습니다.' }
            ),
            '지울 세부 항목이 없습니다.'
          );
        },
      },
      {
        name: 'move_task_detail',
        title: '세부 항목 옮기기',
        kind: 'edit',
        requires: (request) => DETAIL_REQUEST.test(request),
        description: 'Move one detail line (세부 항목) to another task, in the same or the other section.',
        inputContext: currentFormState,
        inputSchema: {
          type: 'object',
          properties: {
            section: SECTION_SCHEMA,
            task: TASK_SCHEMA,
            detail: { type: 'string', description: 'Detail text exactly as in the current state' },
            to_task: { type: 'string', description: 'Task to move it under, exactly as in the current state' },
            to_section: { ...SECTION_SCHEMA, description: 'Section of to_task. Omit if the same section' },
          },
          required: ['section', 'task', 'detail', 'to_task'],
        },
        execute: async (input, context) => {
          const from = resolveTaskInput(input);
          if (typeof from === 'string') return toolError(from);
          const detail = parseTextInput(input.detail, 'detail');
          if (typeof detail !== 'string') return toolError(detail.error);
          const fromRef = from.refs[0];
          const index = findDetailOrFocused(from.projects[fromRef.projectIndex].tasks[fromRef.taskIndex], detail);
          if (typeof index === 'string') return toolError(index);
          const toSection = input.to_section === undefined ? from.section : parseSectionInput(input.to_section);
          if (!toSection) return toolError('to_section 은 "today" 또는 "tomorrow" 여야 합니다.');
          const toTask = parseTextInput(input.to_task, 'to_task');
          if (typeof toTask !== 'string') return toolError(toTask.error);

          const moved = from.projects[fromRef.projectIndex].tasks[fromRef.taskIndex].details[index];
          const removed = updateTasks(from.projects, [fromRef], (t) => ({
            ...t,
            details: t.details.filter((_d, i) => i !== index),
          }));
          const store = useReportFormStore.getState();
          const targetProjects = toSection === from.section ? removed : store[toSection];
          const toRefs = findTasks(targetProjects, undefined, toTask);
          if (typeof toRefs === 'string') return toolError(toRefs);
          const placed = updateTasks(targetProjects, [toRefs[0]], (t) => ({ ...t, details: [...t.details, moved] }));
          const patch: FormPatch =
            toSection === from.section ? { [from.section]: placed } : { [from.section]: removed, [toSection]: placed };
          return changeResult(
            await applyFormChange(context, patch, { success: '에이전트가 세부 항목을 옮겼습니다.' }),
            '이미 그 자리에 있습니다.'
          );
        },
      },

      // ───────────── 통째로 바꾸기 (replace) ─────────────
      // 지금 내용이 사라지면 사라질 줄을 보여 주며 확인을 받는다. 알맞은 작은 도구가 없을 때 쓰는 마지막 수단이기도 하다.
      {
        name: 'fill_report',
        title: '보고서 폼 채우기',
        kind: 'replace',
        // 여러 구역·날짜·모드를 한 번에 받는 도구라 Gemini Nano 가 구역을 헷갈리고 필드를 지어냈다 — 채팅은 위 단순한 도구를 쓴다
        surfaces: ['webmcp'],
        description:
          'Put projects and tasks into the report form. Give only the sections to change — today (금일 업무 진행 현황) and/or tomorrow (익일 업무 진행 예정); omit the others (empty arrays are ignored). mode="append" (default) adds tasks to the project with the same name and appends new projects — always use append for add requests. "replace" replaces the section entirely and asks the user to confirm if existing content would be lost. Only changes the form; saving is save_report.',
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

          const store = useReportFormStore.getState();
          const patch: FormPatch = date ? { reportDate: date } : {};
          for (const bucket of ['today', 'tomorrow'] as const) {
            const value = input[bucket];
            if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
            const parsed = parseProjectsInput(value, bucket);
            if (typeof parsed === 'string') return toolError(parsed);
            patch[bucket] = mode === 'append' ? appendProjects(store[bucket], parsed) : orInitialProjects(parsed);
          }
          if (Object.keys(patch).length === 0) return toolError('month/day, today, tomorrow 중 하나 이상을 주세요.');

          const result = await applyFormChange(context, patch, {
            confirm: {
              when: 'removal',
              title: '작성 중인 내용 교체',
              intro: '에이전트가 보고서 폼을 이렇게 바꾸려고 합니다.',
              confirmText: '교체',
              danger: true,
            },
            success: '에이전트가 보고서 폼을 채웠습니다.',
          });
          if (result.status === 'cancelled')
            return toolError('사용자가 교체를 취소했습니다. 덧붙이려면 mode="append" 로 다시 부르세요.');
          return changeResult(result, '바뀐 내용이 없습니다.');
        },
      },
      {
        name: 'replace_report_section',
        title: '금일·익일 업무 통째로 바꾸기',
        kind: 'replace',
        // 작은 수정의 마지막 수단으로도 두므로 바꾸라는 말이 있을 때만 — "프로젝트 통째로 옮겨줘"에 옮기기 대신 이걸 골라 원래 자리에 남겼다
        requires: (request) => /바꿔|바꾸|교체|새로|다시\s*써|덮어|대신/.test(request),
        description:
          'Rewrite one whole section of the report form with the given projects — only when the user asks to replace or rewrite the section (익일 업무를 이걸로 바꿔줘, 통째로 바꿔줘, 새로 써줘). For a change to one task, project or detail, use the edit tools instead. Shows the user exactly what will be removed and asks to confirm.',
        inputContext: currentFormState,
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
          return changeResult(
            await applyFormChange(
              context,
              { [section]: parsed },
              {
                confirm: {
                  when: 'removal',
                  title: '작성 중인 내용 교체',
                  intro: `에이전트가 ${BUCKET_LABEL[section]}를 이렇게 바꾸려고 합니다.`,
                  confirmText: '교체',
                  danger: true,
                },
                success: `에이전트가 ${BUCKET_LABEL[section]}를 바꿨습니다.`,
              }
            ),
            '바뀐 내용이 없습니다.'
          );
        },
      },
      {
        name: 'import_report_text',
        title: '보고서 텍스트 적용',
        kind: 'replace',
        description:
          'Parse an existing daily report text ("N월 N일 ... 금일 업무 진행 현황 / 익일 업무 진행 예정" format, indented * project / - task (NN%) / · detail) and replace the whole form with it. Asks the user to confirm if content would be lost. Tolerates loose formatting.',
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
          const result = await applyFormChange(
            context,
            {
              ...(parsed.month && parsed.day ? { reportDate: { month: parsed.month, day: parsed.day } } : {}),
              today: orInitialProjects(parsed.todayProjects),
              tomorrow: orInitialProjects(parsed.tomorrowProjects),
            },
            {
              confirm: {
                when: 'removal',
                title: '텍스트 적용',
                intro: '에이전트가 보고서 텍스트를 폼에 적용하려고 합니다.',
                confirmText: '적용',
              },
              success: '에이전트가 보고서 텍스트를 폼에 적용했습니다.',
            }
          );
          if (result.status === 'applied') callbacks.current.onReplaced();
          return changeResult(result, '폼과 같은 내용입니다.');
        },
      },
      {
        name: 'load_report',
        title: '저장된 보고서 불러오기',
        kind: 'replace',
        // 불러오라는 말이 있을 때만 — "보고서 날짜를 어제로 바꿔줘"에 어제 보고서를 불러오려 했다
        requires: (request) => /불러|가져|복원|기록|저장된|저장한|그대로\s*(써|쓰|채워)/.test(request),
        description:
          'Load the saved report for a date into the form (replaces date, today and tomorrow). Asks the user to confirm if content would be lost. To only view it, use get_report.',
        inputSchema: { type: 'object', properties: { date: DATE_KEY_SCHEMA }, required: ['date'] },
        execute: async (input, context) => {
          const date = parseDateKeyInput(input.date, 'date');
          if (typeof date !== 'string') return toolError(date.error);
          const item = await findSavedReport(date, '불러올까요');
          if (isToolResult(item)) return item;
          const result = await applyFormChange(
            context,
            {
              reportDate: { month: item.month, day: item.day },
              today: orInitialProjects([...item.todayProjects]),
              tomorrow: orInitialProjects([...item.tomorrowProjects]),
            },
            {
              confirm: {
                when: 'removal',
                title: '기록 불러오기',
                intro: `${item.month}월 ${item.day}일 보고서를 불러오면 폼이 이렇게 바뀝니다.`,
                confirmText: '불러오기',
              },
              success: `${item.month}월 ${item.day}일 보고서를 불러왔습니다.`,
            }
          );
          if (result.status === 'applied') callbacks.current.onReplaced();
          return changeResult(result, '이미 그 보고서와 같은 내용입니다.');
        },
      },

      // ───────────── 초기화 ─────────────
      {
        name: 'reset_report_form',
        title: '보고서 폼 초기화',
        kind: 'reset',
        summarize: () => '작성 중인 내용을 모두 비웠어요. 저장된 기록은 그대로예요',
        description:
          'Clear the WHOLE report form (both sections). Only when the user wants everything cleared — to delete particular tasks use remove_report_task or remove_duplicate_tasks. Saved history is not deleted. Shows what will be cleared and asks to confirm.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          // resetForm 과 같은 상태 — 날짜는 오늘, 구역마다 빈 프로젝트 하나
          const now = new Date();
          const result = await applyFormChange(
            context,
            {
              reportDate: { month: String(now.getMonth() + 1), day: String(now.getDate()) },
              today: [createEmptyProject()],
              tomorrow: [createEmptyProject()],
            },
            {
              confirm: {
                when: 'always',
                title: '폼 초기화',
                intro: '작성 중인 내용이 모두 지워집니다. 저장된 기록은 그대로 남습니다.',
                confirmText: '초기화',
                danger: true,
              },
              success: '보고서 폼을 초기화했습니다.',
            }
          );
          if (result.status === 'applied') callbacks.current.onReplaced();
          return changeResult(result, '폼이 이미 비어 있습니다.');
        },
      },

      // ───────────── 저장·복사·내보내기 ─────────────
      {
        name: 'save_report',
        title: '보고서 기록에 저장',
        kind: 'save',
        description:
          'Only when the user asks to save: save the current form as the record for the report date, overwriting an existing record for that date. Shows a confirmation and saves only if the user approves. Does not copy to the clipboard (that is copy_report).',
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
        // "복사하기" 버튼 — 클립보드 쓰기는 사용자 활성화가 필요해 확인을 누르는 순간 복사한다
        name: 'copy_report',
        title: '보고서 복사',
        kind: 'save',
        description:
          'Copy the finished report text to the clipboard and save it to history, like the 복사하기 button (복사해줘, 클립보드). Asks the user to confirm.',
        inputSchema: { type: 'object', properties: {} },
        execute: async (_input, context) => {
          const { reportDate, today, tomorrow } = useReportFormStore.getState();
          if (!isSavable(today, tomorrow))
            return toolError('복사할 수 없습니다. 내용이 비어 있거나, 작업이 없는 프로젝트가 있습니다.');
          const ok = await context.confirm({
            title: '보고서 복사',
            description: `${reportDate.month}월 ${reportDate.day}일 보고서를 클립보드에 복사하고 기록에 저장합니다.`,
            confirmText: '복사',
          });
          if (!ok) return toolError('사용자가 복사를 취소했습니다.');
          if (!(await callbacks.current.onCopy()))
            return toolError('클립보드에 복사하지 못했습니다. 화면의 복사하기 버튼을 눌러 주세요.');
          return toolText({ copied: true, saved: true });
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

      // ───────────── 열기 ─────────────
      {
        name: 'open_github_import',
        title: 'GitHub 커밋 가져오기 열기',
        kind: 'navigate',
        // GitHub·커밋·가져오기를 말했을 때만 — "자세히 보여줘"에 이 창을 열었다
        requires: (request) => /github|깃허브|깃헙|커밋|가져오기|가져와/i.test(request),
        description:
          'Open the "GitHub에서 가져오기" dialog that imports GitHub commits into today\'s tasks. The user picks and applies commits in the dialog. Members only — guests see a login prompt.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          callbacks.current.onOpenGithubImport();
          const isMember = useReportHistoryStore.getState().mode === 'user';
          return toolText({
            opened: true,
            message: isMember
              ? // 화면에 그대로 보이는 안내다(이동·열기 도구는 이 문장으로 답한다)
                'GitHub 가져오기 창을 열었어요. 창에서 커밋을 확인하고 적용해 주세요.'
              : 'GitHub 가져오기는 로그인한 회원만 쓸 수 있어요. 창에서 로그인 안내를 확인해 주세요.',
          });
        },
      },
    ];
    if (process.env.NODE_ENV !== 'production') checkToolCoverage([...tools, ...createHistoryAgentTools()]);
    return tools;
  }, enabled);
};
