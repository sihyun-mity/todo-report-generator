import type { Project, ProjectsBucket, Task } from '@/types';
import { createEmptyProject, createId, isProjectEmpty } from '@/utils';

// 에이전트 도구가 폼을 고칠 때 쓰는 순수 함수 — 항목을 id 가 아니라 이름으로 가리킨다(모델은 id 를 모른다).
// 바꾼 결과를 돌려주고, 대상을 정할 수 없으면 모델이 고쳐 다시 부를 수 있도록 이유를 담은 문자열을 돌려준다.

export type ReportBuckets = Readonly<Record<ProjectsBucket, ReadonlyArray<Project>>>;

export type TaskRef = { projectIndex: number; taskIndex: number };

const sameText = (a: string, b: string) => a.trim() === b.trim();

// 빈 배열이 되면 폼에 입력칸이 하나도 없는 상태가 되므로 초기값(빈 프로젝트 1개)으로 둔다.
export const orInitialProjects = (projects: Array<Project>) =>
  projects.length > 0 ? projects : [createEmptyProject()];

// 1부터 세는 위치(모델이 주는 값)를 배열 삽입 위치로. 없거나 범위를 넘으면 맨 뒤.
const insertAt = <T>(list: ReadonlyArray<T>, item: T, position?: number) => {
  const next = [...list];
  const index = position === undefined ? next.length : Math.max(0, Math.min(position - 1, next.length));
  next.splice(index, 0, item);
  return next;
};

// 같은 작업 둘을 하나로 — 진행률은 큰 쪽(또는 지정한 값), 세부 항목은 합친다(같은 줄은 한 번만)
const mergeTask = (base: Task, extra: Task, progress = Math.max(base.progress, extra.progress)): Task => ({
  ...base,
  progress,
  details: [
    ...base.details,
    ...extra.details.filter((d) => !base.details.some((bd) => sameText(bd.content, d.content))),
  ],
});

// 이름으로 하나를 고른다 — 정확히 같은 것 → 포함 관계 순. 서로 다른 후보가 여럿이면 고르지 않고 후보를 돌려준다
// (모델이 "토큰 로그인"처럼 일부만 주기도 한다).
const pickByName = <T>(
  items: ReadonlyArray<T>,
  nameOf: (item: T) => string,
  query: string,
  label: Readonly<{ name: string; object: string; subject: string }>
): Array<T> | string => {
  const named = items.filter((item) => nameOf(item).trim() !== '');
  // "토큰 로그인 작업"처럼 종류 이름을 붙여 부르면 뗀다 — 모델이 요청 문구를 그대로 넣어 "찾지 못했습니다"로 끝났다.
  // 붙인 채로 맞는 이름이 있으면(이름 자체가 "…작업"으로 끝나면) 그대로 쓴다
  const raw = query.trim();
  const stripped = raw.replace(/\s*(작업|업무|프로젝트|세부\s*항목|항목)$/, '').trim();
  const q = stripped !== '' && !named.some((item) => sameText(nameOf(item), raw)) ? stripped : raw;
  const exact = named.filter((item) => sameText(nameOf(item), q));
  const found =
    exact.length > 0
      ? exact
      : named.filter((item) => {
          const name = nameOf(item).trim();
          return q !== '' && (name.includes(q) || q.includes(name));
        });
  const names = [...new Set(found.map((item) => nameOf(item).trim()))];
  if (names.length === 0)
    return `"${q}" ${label.object} 찾지 못했습니다. 지금 있는 ${label.name}: ${[...new Set(named.map((i) => nameOf(i).trim()))].join(', ') || '(없음)'}`;
  if (names.length > 1)
    return `여러 ${label.subject} 맞습니다: ${names.join(', ')}. 그중 하나의 정확한 이름으로 다시 부르세요.`;
  return found;
};

export const findProject = (projects: ReadonlyArray<Project>, name: string): number | string => {
  const found = pickByName(
    projects.map((p, index) => ({ name: p.name, index })),
    (p) => p.name,
    name,
    { name: '프로젝트', object: '프로젝트를', subject: '프로젝트가' }
  );
  if (typeof found === 'string') return found;
  return found[0].index;
};

// 작업을 이름으로 찾는다. 프로젝트명은 폼에 있을 때만 범위로 쓴다(모델이 지어내기도 한다).
// 같은 이름의 작업이 여럿(중복)이면 모두 돌려준다.
export const findTasks = (projects: ReadonlyArray<Project>, projectName: unknown, taskName: string) => {
  const scoped =
    typeof projectName === 'string' && projects.some((p) => sameText(p.name, projectName))
      ? (p: Project) => sameText(p.name, projectName)
      : () => true;
  const all = projects.flatMap((p, projectIndex) =>
    scoped(p) ? p.tasks.map((t, taskIndex) => ({ projectIndex, taskIndex, content: t.content })) : []
  );
  const found = pickByName(all, (r) => r.content, taskName, { name: '작업', object: '작업을', subject: '작업이' });
  if (typeof found === 'string') return found;
  return found.map(({ projectIndex, taskIndex }): TaskRef => ({ projectIndex, taskIndex }));
};

const isRef = (ref: TaskRef, pi: number, ti: number) => ref.projectIndex === pi && ref.taskIndex === ti;

export const updateTasks = (
  projects: ReadonlyArray<Project>,
  refs: ReadonlyArray<TaskRef>,
  update: (task: Task) => Task
): Array<Project> =>
  projects.map((p, pi) =>
    refs.some((r) => r.projectIndex === pi)
      ? { ...p, tasks: p.tasks.map((t, ti) => (refs.some((r) => isRef(r, pi, ti)) ? update(t) : t)) }
      : p
  );

// 작업을 지운 뒤 작업이 하나도 남지 않은 프로젝트는 뺀다(프로젝트당 작업 최소 1개)
export const removeTasks = (projects: ReadonlyArray<Project>, refs: ReadonlyArray<TaskRef>): Array<Project> =>
  orInitialProjects(
    projects
      .map((p, pi) => {
        if (!refs.some((r) => r.projectIndex === pi)) return p;
        const tasks = p.tasks.filter((_t, ti) => !refs.some((r) => isRef(r, pi, ti)));
        return tasks.length > 0 ? { ...p, tasks } : null;
      })
      .filter((p): p is Project => p !== null)
  );

// 같은 프로젝트 안의 같은 내용 작업을 하나로 합친다(처음 자리에 둔다). 합친 게 없으면 null.
export const dedupeTasks = (projects: ReadonlyArray<Project>): Array<Project> | null => {
  let changed = false;
  const next = projects.map((p) => {
    const tasks: Array<Task> = [];
    for (const task of p.tasks) {
      const at = task.content.trim() === '' ? -1 : tasks.findIndex((t) => sameText(t.content, task.content));
      if (at === -1) tasks.push(task);
      else {
        tasks[at] = mergeTask(tasks[at], task);
        changed = true;
      }
    }
    return tasks.length === p.tasks.length ? p : { ...p, tasks };
  });
  return changed ? next : null;
};

// 덧붙이기: 같은 이름의 프로젝트에는 작업만 덧붙이고, 나머지는 뒤에 추가한다.
// 같은 프로젝트에 같은 내용의 작업이 이미 있으면 덧붙이지 않고 그 작업을 고친다 — "진행률도 똑같이 넣어줘"에
// Nano 가 덧붙이기를 골라 같은 작업이 둘이 됐다. 진행률은 0(말하지 않으면 0)이 아닐 때만 새 값으로 바꾼다.
// 버킷이 초기값(빈 프로젝트만 있음)이면 그대로 교체한다.
export const appendProjects = (prev: ReadonlyArray<Project>, next: ReadonlyArray<Project>): Array<Project> => {
  if (prev.every(isProjectEmpty)) return orInitialProjects([...next]);
  const merged = [...prev];
  for (const project of next) {
    const index = merged.findIndex((p) => sameText(p.name, project.name));
    if (index === -1) {
      merged.push(project);
      continue;
    }
    const tasks = [...merged[index].tasks];
    for (const task of project.tasks) {
      const at = tasks.findIndex((t) => sameText(t.content, task.content));
      if (at === -1) tasks.push(task);
      else tasks[at] = mergeTask(tasks[at], task, task.progress > 0 ? task.progress : tasks[at].progress);
    }
    merged[index] = { ...merged[index], tasks };
  }
  return merged;
};

// 프로젝트 이름 바꾸기. 같은 구역에 바꿀 이름의 프로젝트가 이미 있으면 작업을 그쪽으로 합친다.
export const renameProject = (projects: ReadonlyArray<Project>, index: number, name: string): Array<Project> => {
  const target = projects.findIndex((p, i) => i !== index && sameText(p.name, name));
  if (target === -1) return projects.map((p, i) => (i === index ? { ...p, name: name.trim() } : p));
  const merged = appendProjects([projects[target]], [{ ...projects[index], name: projects[target].name }]);
  return projects.flatMap((p, i) => (i === index ? [] : i === target ? merged : [p]));
};

export const removeProject = (projects: ReadonlyArray<Project>, index: number): Array<Project> =>
  orInitialProjects(projects.filter((_p, i) => i !== index));

// 작업 하나를 다른 구역·프로젝트·위치로 옮긴다(같은 프로젝트 안이면 순서 바꾸기).
// 받을 프로젝트를 주지 않으면 원래 프로젝트와 같은 이름의 프로젝트로 — 없으면 만든다.
export const moveTask = (
  buckets: ReportBuckets,
  from: ProjectsBucket,
  ref: TaskRef,
  to: ProjectsBucket,
  toProjectName: string | undefined,
  position: number | undefined
): Record<ProjectsBucket, Array<Project>> | string => {
  const source = buckets[from][ref.projectIndex];
  const task = source.tasks[ref.taskIndex];
  const targetName = toProjectName?.trim() || source.name;

  // 옮긴 자리에 같은 작업이 생기면 합친다(진행률은 큰 쪽)
  const place = (projects: ReadonlyArray<Project>): Array<Project> => {
    const base = projects.every(isProjectEmpty) ? [] : [...projects];
    const index = base.findIndex((p) => sameText(p.name, targetName));
    if (index === -1) return [...base, { id: createId(), name: targetName, tasks: [{ ...task, id: createId() }] }];
    const same = base[index].tasks.findIndex((t) => sameText(t.content, task.content));
    const tasks =
      same === -1
        ? insertAt(base[index].tasks, task, position)
        : base[index].tasks.map((t, i) => (i === same ? mergeTask(t, task) : t));
    base[index] = { ...base[index], tasks };
    return base;
  };

  // 같은 프로젝트 안에서 순서만 바꾼다
  if (from === to && sameText(targetName, source.name)) {
    if (position === undefined) return '같은 프로젝트 안에서 옮기려면 position(1부터)을 주세요.';
    const rest = source.tasks.filter((_t, i) => i !== ref.taskIndex);
    const projects = buckets[from].map((p, i) =>
      i === ref.projectIndex ? { ...p, tasks: insertAt(rest, task, position) } : p
    );
    return { ...buckets, [from]: projects } as Record<ProjectsBucket, Array<Project>>;
  }

  const removed = removeTasks(buckets[from], [ref]);
  const next = { today: [...buckets.today], tomorrow: [...buckets.tomorrow], [from]: removed };
  next[to] = place(next[to]);
  return next;
};

// 프로젝트 하나를 다른 구역으로 옮기거나(같은 이름이 있으면 합친다) 같은 구역 안에서 순서를 바꾼다.
export const moveProject = (
  buckets: ReportBuckets,
  from: ProjectsBucket,
  index: number,
  to: ProjectsBucket,
  position: number | undefined
): Record<ProjectsBucket, Array<Project>> | string => {
  const project = buckets[from][index];
  if (from === to) {
    if (position === undefined) return '같은 금일·익일 업무 안에서 옮기려면 position(1부터)을 주세요.';
    const rest = buckets[from].filter((_p, i) => i !== index);
    return { ...buckets, [from]: insertAt(rest, project, position) } as Record<ProjectsBucket, Array<Project>>;
  }
  const target = buckets[to];
  const hasSame = target.some((p) => sameText(p.name, project.name));
  const placed = hasSame
    ? appendProjects(target, [project])
    : insertAt(
        target.filter((p) => !isProjectEmpty(p)),
        project,
        position
      );
  return {
    today: [...buckets.today],
    tomorrow: [...buckets.tomorrow],
    [from]: removeProject(buckets[from], index),
    [to]: orInitialProjects(placed),
  } as Record<ProjectsBucket, Array<Project>>;
};

// 작업 아래 세부 항목을 이름으로 찾는다
export const findDetail = (task: Task, detail: string): number | string => {
  const found = pickByName(
    task.details.map((d, index) => ({ content: d.content, index })),
    (d) => d.content,
    detail,
    { name: '세부 항목', object: '세부 항목을', subject: '세부 항목이' }
  );
  if (typeof found === 'string') return found;
  return found[0].index;
};

// from 에 있는 같은 작업(같은 프로젝트명·내용)의 진행률을 to 에 맞춘다. 바뀐 게 없으면 null.
export const syncProgressFrom = (from: ReadonlyArray<Project>, to: ReadonlyArray<Project>): Array<Project> | null => {
  let changed = false;
  const next = to.map((p) => ({
    ...p,
    tasks: p.tasks.map((t) => {
      const source = from.find((fp) => sameText(fp.name, p.name))?.tasks.find((ft) => sameText(ft.content, t.content));
      if (!source || source.progress === t.progress) return t;
      changed = true;
      return { ...t, progress: source.progress };
    }),
  }));
  return changed ? next : null;
};
