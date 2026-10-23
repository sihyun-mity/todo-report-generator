import type {
  CommitImportLink,
  CommitImportPlan,
  GithubCommit,
  PlannedDetail,
  Project,
  ReportHistoryItem,
  Task,
} from '@/types';
import { cloneProjects, commitScope, createId, isProjectEmpty, reportItemDateKey } from '@/utils';

// 날짜 키('YYYY-MM-DD')의 로컬 0시 + offsetDays 일
const dayStartMs = (dateKey: string, offsetDays = 0) => {
  const [y, m, d] = dateKey.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d + offsetDays).getTime();
};

/**
 * 보고서 날짜(`reportDateKey`)에 담을 커밋의 조회 범위. `untilMs === null` 이면 지금까지다.
 *
 * - 기준(anchor)은 그 날짜 직전 보고서다. 오늘(이후) 보고서를 쓰는 중이면 오늘 이미 저장한 보고서도 기준이 된다 —
 *   오늘 한 번 보고한 뒤 다시 가져오면 그 뒤 커밋만 온다. 지난 날짜면 그 날짜 자신의 기록은 기준에서 뺀다.
 * - since: 기준 보고서 작성(저장) 시각. 단, 밀린 보고서를 나중에 몰아 쓴 경우처럼 기준 보고서가 범위 끝 이후에 저장됐으면
 *   작성 시각 대신 그 보고서 날짜의 다음 날 0시로 본다(보고서 날짜의 커밋은 그 보고서 몫).
 *   기준 보고서가 없으면 보고서 날짜 0시.
 * - until: 지난 날짜면 그 날짜 다음 날 0시 — 그 뒤 커밋은 다음 보고서 몫이다.
 * - 기준이 아주 오래전이어도 여기서는 자르지 않는다. 최대 조회 기간은 서버(`fetchGithubCommits`)가 강제한다.
 *
 * `history` 에 기준 보고서가 적재돼 있어야 한다(회원은 월 단위로 적재하므로 호출부가 그 월을 먼저 불러온다).
 */
export const commitImportRange = (
  history: ReadonlyArray<ReportHistoryItem>,
  reportDateKey: string,
  todayKey: string,
  nowMs: number
): { sinceMs: number; untilMs: number | null } => {
  const isPast = reportDateKey < todayKey;
  const untilMs = isPast ? dayStartMs(reportDateKey, 1) : null;
  const endMs = untilMs ?? nowMs;

  let anchor: { key: string; timestamp: number } | null = null;
  for (const item of history) {
    const key = reportItemDateKey(item);
    if (isPast ? key >= reportDateKey : key > todayKey) continue;
    if (!anchor || key > anchor.key || (key === anchor.key && item.timestamp > anchor.timestamp)) {
      anchor = { key, timestamp: item.timestamp };
    }
  }

  if (!anchor) return { sinceMs: dayStartMs(isPast ? reportDateKey : todayKey), untilMs };
  const sinceMs = anchor.timestamp < endMs ? anchor.timestamp : Math.min(dayStartMs(anchor.key, 1), endMs);
  return { sinceMs, untilMs };
};

// 저장소 + Conventional Commit scope. 같은 묶음의 작업명 보정을 기억하는 키다(scope 가 없으면 기억하지 않는다).
export const commitScopeKey = (commit: Pick<GithubCommit, 'repo' | 'message'>): string | null => {
  const scope = commitScope(commit.message);
  return scope ? `${commit.repo}#${scope}` : null;
};

// 미리보기에서 확정한 계획을 금일 프로젝트 목록에 병합한다. 기존 내용은 지우지 않고 더하기만 한다.
// - 체크한 작업만 반영한다. 새 작업 / 새 프로젝트는 뒤에 추가하고, 폼이 초기 빈 상태면 그 빈 프로젝트를 대체한다.
// - 기존 작업: 진행률을 계획 값으로 맞추고 세부 항목을 덧붙인다(같은 문구는 건너뜀).
// links 는 폼에 들어간 프로젝트·작업·세부 항목 id 와 원래 커밋·제안 문구(새 작업은 제안 진행률도)의 연결이다 — 사용자가 폼에서 이름·문구를
// 고친 뒤 보고서를 저장하면 이 연결로 최종 표기를 찾아 메모리에 기억한다(`learnFromSavedReport`).
export const applyCommitImportPlan = (
  today: ReadonlyArray<Project>,
  plan: CommitImportPlan
): { projects: Array<Project>; links: Array<CommitImportLink> } => {
  const result = cloneProjects(today);
  const isInitial = result.length === 1 && isProjectEmpty(result[0]);
  const appended: Array<Project> = [];
  const links: Array<CommitImportLink> = [];

  const linkTask = (
    projectId: string,
    taskId: string,
    commits: ReadonlyArray<GithubCommit>,
    details: ReadonlyArray<{ id: string; planned: PlannedDetail }>
  ) => {
    const scopeKeys = new Set(commits.map(commitScopeKey).filter((key): key is string => key !== null));
    scopeKeys.forEach((scopeKey) => links.push({ kind: 'task', scopeKey, projectId, taskId }));
    // AI 가 제안한 세부 항목만 연결한다 — 사용자가 직접 추가한 줄은 배울 기준(제안 문구)이 없다
    details.forEach(({ id, planned }) => {
      if (planned.suggested === null) return;
      links.push({
        kind: 'detail',
        projectId,
        taskId,
        detailId: id,
        original: planned.suggested,
        inserted: planned.content.trim(),
      });
    });
  };

  // 반영 시점의 세부 항목 — 보고서 저장 때 여기 없는 줄을 사용자가 직접 추가한 것으로 센다
  const linkDetails = (projectId: string, task: Pick<Task, 'id' | 'details'>) =>
    links.push({ kind: 'details', projectId, taskId: task.id, known: task.details.map((d) => d.id) });

  for (const plannedProject of plan.projects) {
    const tasks = plannedProject.tasks.filter((t) => t.included && t.content.trim());
    if (!tasks.length) continue;

    const target =
      plannedProject.existingProjectId !== null
        ? result.find((p) => p.id === plannedProject.existingProjectId)
        : undefined;
    // 새 프로젝트도 같은 이름이 이미 폼에 있으면(미리보기에서 이름을 바꾼 경우 등) 그 프로젝트에 합친다
    let project =
      target ??
      result.find((p) => p.name.trim() !== '' && p.name.trim() === plannedProject.name.trim()) ??
      appended.find((p) => p.name.trim() === plannedProject.name.trim());

    if (!project) {
      project = { id: createId(), name: plannedProject.name.trim(), tasks: [] };
      appended.push(project);
    }
    plannedProject.repos.forEach((repo) => links.push({ kind: 'project', repo, projectId: project.id }));

    for (const plannedTask of tasks) {
      const plannedDetails = plannedTask.details.filter((d) => d.content.trim());
      const existingTask =
        plannedTask.existingTaskId !== null
          ? project.tasks.find((t) => t.id === plannedTask.existingTaskId)
          : undefined;
      if (existingTask) {
        const known = new Set(existingTask.details.map((d) => d.content.trim()));
        const added = plannedDetails
          .filter((d) => !known.has(d.content.trim()))
          .map((planned) => ({ id: createId(), planned }));
        existingTask.details = [
          ...existingTask.details,
          ...added.map(({ id, planned }) => ({ id, content: planned.content.trim() })),
        ];
        existingTask.progress = plannedTask.progress;
        linkTask(project.id, existingTask.id, plannedTask.commits, added);
        linkDetails(project.id, existingTask);
        continue;
      }
      const added = plannedDetails.map((planned) => ({ id: createId(), planned }));
      const task = {
        id: createId(),
        content: plannedTask.content.trim(),
        progress: plannedTask.progress,
        details: added.map(({ id, planned }) => ({ id, content: planned.content.trim() })),
      };
      // 비어 있는 작업 줄(새 프로젝트의 기본 줄 등)은 지우고 채운다
      project.tasks = [...project.tasks.filter((t) => t.content.trim() || t.details.length), task];
      linkTask(project.id, task.id, plannedTask.commits, added);
      linkDetails(project.id, task);
      // 등록 기록 id 는 계획의 작업 key 를 쓴다 — `rememberCommitImport` 가 이 key 로 계획의 작업을 찾아 기록을 만든다
      links.push({ kind: 'imported', projectId: project.id, taskId: task.id, recordId: plannedTask.key });
      if (plannedTask.suggestedProgress !== null) {
        links.push({
          kind: 'progress',
          projectId: project.id,
          taskId: task.id,
          task: task.content,
          commits: plannedTask.commits.map((c) => c.message),
          suggested: plannedTask.suggestedProgress,
          inserted: task.progress,
        });
      }
    }
  }

  return { projects: isInitial && appended.length ? appended : [...result, ...appended], links };
};
