import type { CommitImportPlan, Project, ProjectsBucket, Task, TodayGoalDropTarget, TodayGoalsStorage } from '@/types';
import { COMMIT_IMPORT_DEFAULT_PROGRESS, TODAY_GOALS_STORAGE_KEY } from '@/constants';
import { appendProjects, createId, hasProjectContent, isProjectEmpty } from '@/utils';

// 오늘의 목표 — 직전 보고서의 "익일 업무 진행 예정"을 오늘 금일·익일 업무로 옮기기 전에 잠시 두는 자리.
// 예전에는 익일 예정을 금일 업무에 통째로 넣었는데, 취소된 일까지 금일에 들어가 지워야 했다.
// 목표는 프로젝트 → 작업 형태(`Project[]`)로 두고, 사용자가 금일·익일로 옮긴 작업만 보고서에 들어간다.
// 옮기지 않은 목표는 다음 날 그날의 직전 보고서(오늘 저장한 보고서)가 새 출처가 되면서 자연히 사라진다.

const sameText = (a: string, b: string) => a.trim() === b.trim();

// 목표 하나를 가리키는 키 — 프로젝트명 + 작업 내용. 새로 고침 뒤 남은 목표를 되살리거나 이미 옮긴 목표를 알아보는 데 쓴다
// (id 는 기록을 불러올 때마다 새로 만들므로 쓸 수 없다)
export const todayGoalKey = (projectName: string, taskContent: string) =>
  `${projectName.trim()}\u0000${taskContent.trim()}`;

export const todayGoalKeys = (goals: ReadonlyArray<Project>) =>
  goals.flatMap((p) => p.tasks.map((t) => todayGoalKey(p.name, t.content)));

// 목표 목록이 prev → next 로 바뀔 때 넘긴 목표 키를 고친다 — 목록에서 빠졌는데 보고서(금일·익일)에 없으면 넘긴 것,
// 다시 목록에 들어왔으면(실행 취소·되돌리기) 넘긴 것에서 뺀다
export const nextDismissedGoalKeys = (
  dismissed: ReadonlySet<string>,
  prev: ReadonlyArray<Project>,
  next: ReadonlyArray<Project>,
  report: ReadonlyArray<ReadonlyArray<Project>>
): Set<string> => {
  const nextKeys = new Set(todayGoalKeys(next));
  const reportKeys = new Set(report.flatMap((projects) => todayGoalKeys(projects)));
  const result = new Set([...dismissed].filter((key) => !nextKeys.has(key)));
  for (const key of todayGoalKeys(prev)) if (!nextKeys.has(key) && !reportKeys.has(key)) result.add(key);
  return result;
};

export const countTodayGoals = (goals: ReadonlyArray<Project>) => goals.reduce((sum, p) => sum + p.tasks.length, 0);

// 직전 보고서의 익일 예정에서 오늘의 목표를 만든다.
// - 내용이 있는 작업만 목표가 된다(빈 줄은 뺀다).
// - 지금 폼(금일·익일)에 같은 프로젝트·같은 내용의 작업이 이미 있으면 옮긴 목표로 보고 뺀다 — 오늘 저장한 보고서를 복원했을 때.
// - dismissed(같은 날 이 기기에서 넘긴 목표)는 뺀다 — 넘긴 목표가 새로 고침 뒤 되살아나지 않게. 옮긴 목표는 기억하지 않는다 —
//   저장하지 않고 새로 고치면 폼의 내용이 사라지므로, 옮겼던 목표는 다시 목표로 돌아와야 한다(보고서를 저장했으면 위 규칙으로 빠진다).
// id 는 새로 만든다 — 보드에 옮기면 그대로 작업 id 가 되므로 출처 기록의 id 와 겹치지 않게 한다.
export const buildTodayGoals = (
  source: ReadonlyArray<Project>,
  placed: ReadonlyArray<ReadonlyArray<Project>>,
  dismissed: ReadonlySet<string> | null
): Array<Project> => {
  const placedKeys = new Set(placed.flatMap((projects) => todayGoalKeys(projects)));
  return source
    .filter(hasProjectContent)
    .map(
      (p): Project => ({
        id: createId(),
        name: p.name.trim(),
        tasks: p.tasks
          .filter((t) => t.content.trim() !== '')
          .filter((t) => {
            const key = todayGoalKey(p.name, t.content);
            return !placedKeys.has(key) && !dismissed?.has(key);
          })
          .map((t) => ({
            ...t,
            id: createId(),
            content: t.content.trim(),
            details: (t.details ?? []).filter((d) => d.content.trim() !== '').map((d) => ({ ...d, id: createId() })),
          })),
      })
    )
    .filter((p) => p.tasks.length > 0);
};

// 목표 작업 id → 그 작업과 프로젝트
export const findTodayGoal = (goals: ReadonlyArray<Project>, taskId: string) => {
  for (const project of goals) {
    const task = project.tasks.find((t) => t.id === taskId);
    if (task) return { project, task };
  }
  return null;
};

// 목표에서 작업들을 뺀다(작업이 남지 않은 프로젝트도 뺀다)
export const withoutTodayGoals = (goals: ReadonlyArray<Project>, taskIds: ReadonlySet<string>): Array<Project> =>
  goals
    .map((p) =>
      p.tasks.some((t) => taskIds.has(t.id)) ? { ...p, tasks: p.tasks.filter((t) => !taskIds.has(t.id)) } : p
    )
    .filter((p) => p.tasks.length > 0);

const isBlankTask = (t: Task) => t.content.trim() === '' && t.details.every((d) => d.content.trim() === '');

// 목표 작업을 한 구역(금일·익일) 목록에 넣는다.
// - target 이 없으면(클릭·Nano·GitHub) 같은 이름의 프로젝트에 덧붙이고, 없으면 프로젝트를 새로 만든다. 같은 프로젝트에 같은
//   내용의 작업이 이미 있으면 새로 넣지 않고 그 작업에 합친다(appendProjects). 구역이 비어 있으면(초기값) 그대로 바꾼다.
// - target 이 있으면(끌어 놓기) 그 프로젝트의 그 자리에 넣는다. 그 프로젝트가 이름 없는 빈 프로젝트면 목표의 프로젝트명을
//   채우고, 비어 있는 작업 줄은 목표 작업으로 바꾼다(초기 빈 줄이 남지 않게). fillBlank 가 false 면(끌기 중 미리보기) 채우지 않고
//   그 자리에 끼워 넣기만 한다 — 지나가기만 한 프로젝트의 이름·빈 줄이 바뀌지 않게. 놓은 뒤 `settleTodayGoalDrop` 이 정리한다.
export const placeTodayGoalTasks = (
  projects: ReadonlyArray<Project>,
  goals: ReadonlyArray<Project>,
  taskIds: ReadonlyArray<string>,
  target?: TodayGoalDropTarget,
  fillBlank = true
): Array<Project> => {
  const picked = taskIds.flatMap((id) => findTodayGoal(goals, id) ?? []);
  if (picked.length === 0) return [...projects];

  const targetProject = target ? projects.find((p) => p.id === target.projectId) : undefined;
  if (target && targetProject && !fillBlank) {
    const nextTasks = [...targetProject.tasks];
    nextTasks.splice(Math.max(0, Math.min(target.index, nextTasks.length)), 0, ...picked.map(({ task }) => task));
    return projects.map((p) => (p.id === targetProject.id ? { ...p, tasks: nextTasks } : p));
  }
  if (target && targetProject) {
    const tasks = picked.map(({ task }) => task);
    const kept = targetProject.tasks.filter((t) => !isBlankTask(t));
    // 지운 빈 줄만큼 넣을 위치를 당긴다
    const blankBefore = targetProject.tasks.slice(0, target.index).filter(isBlankTask).length;
    const index = Math.max(0, Math.min(target.index - blankBefore, kept.length));
    const nextTasks = [...kept];
    nextTasks.splice(index, 0, ...tasks);
    const name = targetProject.name.trim() === '' ? picked[0].project.name : targetProject.name;
    return projects.map((p) => (p.id === targetProject.id ? { ...p, name, tasks: nextTasks } : p));
  }

  // 프로젝트 단위로 묶어 덧붙인다(같은 프로젝트의 목표 여럿이 한 프로젝트로 들어가게)
  const grouped: Array<Project> = [];
  for (const { project, task } of picked) {
    const group = grouped.find((g) => sameText(g.name, project.name));
    if (group) group.tasks.push(task);
    else grouped.push({ id: createId(), name: project.name, tasks: [task] });
  }
  return appendProjects(projects, grouped);
};

// 끌어 놓기를 마친 목표 작업 — 들어간 프로젝트가 이름 없는 빈 프로젝트면 목표의 프로젝트명을 채우고 빈 작업 줄을 지운다
// (끌기 중에는 끼워 넣기만 해 두었다). 그 작업이 없으면(밖에 놓아 되돌림) 그대로 둔다.
export const settleTodayGoalDrop = (
  projects: ReadonlyArray<Project>,
  taskId: string,
  projectName: string
): Array<Project> | null => {
  const owner = projects.find((p) => p.tasks.some((t) => t.id === taskId));
  if (!owner) return null;
  const tasks = owner.tasks.filter((t) => t.id === taskId || !isBlankTask(t));
  const name = owner.name.trim() === '' ? projectName : owner.name;
  if (tasks.length === owner.tasks.length && name === owner.name) return null;
  return projects.map((p) => (p.id === owner.id ? { ...p, name, tasks } : p));
};

// 목표 작업이 구역 목록에 들어간 뒤의 작업 id — 같은 내용의 작업과 합쳐졌으면 그 작업의 id 다
export const findPlacedTodayGoal = (
  projects: ReadonlyArray<Project>,
  goal: Readonly<{ projectName: string; task: Task }>
): { projectId: string; taskId: string } | null => {
  for (const project of projects) {
    const byId = project.tasks.find((t) => t.id === goal.task.id);
    if (byId) return { projectId: project.id, taskId: byId.id };
  }
  for (const project of projects) {
    if (!sameText(project.name, goal.projectName)) continue;
    const same = project.tasks.find((t) => sameText(t.content, goal.task.content));
    if (same) return { projectId: project.id, taskId: same.id };
  }
  return null;
};

// GitHub 가져오기 분류 후보 — 금일 폼에 오늘의 목표를 끼워 넣는다. 같은 이름의 프로젝트가 있으면 그 프로젝트의 작업으로,
// 없으면 목표 프로젝트(목표의 프로젝트 id 그대로)로 둔다. 분류기는 이 목록의 작업에 커밋을 붙이므로, 목표에 커밋이 붙으면
// 적용할 때 그 목표를 금일 업무로 옮긴다(`resolveGoalsInPlan`).
// 금일 폼이 초기값(빈 프로젝트만)이면 목표만 후보다.
// 목표 작업의 진행률은 0(예정)인 경우가 많은데, 커밋이 붙었다는 건 한 일이 있다는 뜻이라 새 작업과 같은 기본값으로 둔다
// (기존 작업에 붙으면 그 작업의 진행률이 그대로 제안된다). 미리보기에서 고칠 수 있다.
export const withTodayGoalCandidates = (
  today: ReadonlyArray<Project>,
  goals: ReadonlyArray<Project>
): Array<Project> => {
  const base = today.every(isProjectEmpty) ? [] : today.map((p) => ({ ...p, tasks: [...p.tasks] }));
  for (const goal of goals) {
    const tasks = goal.tasks.map((t) => ({
      ...t,
      progress: t.progress > 0 ? t.progress : COMMIT_IMPORT_DEFAULT_PROGRESS,
    }));
    const same = goal.name !== '' ? base.find((p) => sameText(p.name, goal.name)) : undefined;
    if (same) same.tasks.push(...tasks.filter((t) => !same.tasks.some((st) => sameText(st.content, t.content))));
    else base.push({ ...goal, tasks });
  }
  return base.length > 0 ? base : [...today];
};

// GitHub 가져오기 결과에서 오늘의 목표에 커밋이 붙은 작업을 찾아 그 목표를 금일 업무로 먼저 옮기고, 계획이 가리키는 목표
// id(작업·목표 프로젝트)를 옮긴 자리의 id 로 바꾼다. 그다음 평소처럼 `applyCommitImportPlan` 으로 반영하면 된다.
// placed = 금일 업무로 옮긴 목표 작업 id
export const resolveTodayGoalsInPlan = (
  today: ReadonlyArray<Project>,
  goals: ReadonlyArray<Project>,
  plan: CommitImportPlan
): { today: Array<Project>; goals: Array<Project>; plan: CommitImportPlan; placed: Array<string> } => {
  const goalTaskIds = new Set(goals.flatMap((g) => g.tasks.map((t) => t.id)));
  const goalProjectIds = new Set(goals.map((g) => g.id));
  const used = [
    ...new Set(
      plan.projects.flatMap((p) =>
        p.tasks
          .filter((t) => t.included && t.existingTaskId !== null && goalTaskIds.has(t.existingTaskId))
          .map((t) => t.existingTaskId!)
      )
    ),
  ];
  const placedToday = placeTodayGoalTasks(today, goals, used);
  const where = new Map(
    used.flatMap((id) => {
      const goal = findTodayGoal(goals, id);
      const found = goal && findPlacedTodayGoal(placedToday, { projectName: goal.project.name, task: goal.task });
      return found ? [[id, { ...found, goalProjectId: goal.project.id }] as const] : [];
    })
  );
  const projects = plan.projects.map((p) => {
    const tasks = p.tasks.map((t) => {
      if (t.existingTaskId === null || !goalTaskIds.has(t.existingTaskId)) return t;
      // 해제한 목표 작업은 옮기지 않았으므로 연결할 작업이 없다
      const found = where.get(t.existingTaskId);
      return found ? { ...t, existingTaskId: found.taskId } : t;
    });
    if (p.existingProjectId === null || !goalProjectIds.has(p.existingProjectId)) return { ...p, tasks };
    // 목표 프로젝트 — 그 목표를 옮긴 프로젝트로 잇고, 옮긴 게 없으면 이름으로 새 프로젝트(또는 같은 이름 프로젝트)에 넣는다
    const moved = [...where.values()].find((w) => w.goalProjectId === p.existingProjectId);
    return { ...p, existingProjectId: moved?.projectId ?? null, tasks };
  });
  return {
    today: placedToday,
    goals: withoutTodayGoals(goals, new Set(used)),
    plan: { ...plan, projects },
    placed: used,
  };
};

export const BUCKET_GOAL_LABEL: Record<ProjectsBucket, string> = { today: '금일 업무', tomorrow: '익일 업무' };

// ───────────── 넘긴 목표 (이 기기) ─────────────
// 같은 사람(owner)·같은 날·같은 출처 보고서일 때만 쓴다 — 날이 바뀌면 출처가 바뀌어 저절로 버려진다(목표 소멸).
// 저장소를 쓸 수 없으면(사생활 보호 모드 등) 남은 목표를 기억하지 못할 뿐 동작한다.

const goalsOwner = (userId: string | null) => userId ?? 'guest';

export const readTodayGoalsStorage = (
  userId: string | null,
  dateKey: string,
  sourceDateKey: string
): ReadonlySet<string> | null => {
  try {
    const raw = localStorage.getItem(TODAY_GOALS_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<TodayGoalsStorage>;
    if (
      stored.owner !== goalsOwner(userId) ||
      stored.dateKey !== dateKey ||
      stored.sourceDateKey !== sourceDateKey ||
      !Array.isArray(stored.dismissed)
    )
      return null;
    return new Set(stored.dismissed.filter((key): key is string => typeof key === 'string'));
  } catch {
    return null;
  }
};

export const writeTodayGoalsStorage = (
  userId: string | null,
  dateKey: string,
  sourceDateKey: string,
  dismissed: ReadonlyArray<string>
) => {
  try {
    const value: TodayGoalsStorage = { owner: goalsOwner(userId), dateKey, sourceDateKey, dismissed: [...dismissed] };
    localStorage.setItem(TODAY_GOALS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage 쿼터 초과 등은 무시
  }
};
