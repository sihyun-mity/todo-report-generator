import type { CommitImportLink, CommitImportPlan, GithubCommit, PlannedDetail, Project } from '@/types';
import { cloneProjects, commitScope, createId, isProjectEmpty } from '@/utils';

// 저장소 + Conventional Commit scope. 같은 묶음의 작업명 보정을 기억하는 키다(scope 가 없으면 기억하지 않는다).
export const commitScopeKey = (commit: Pick<GithubCommit, 'repo' | 'message'>): string | null => {
  const scope = commitScope(commit.message);
  return scope ? `${commit.repo}#${scope}` : null;
};

// 미리보기에서 확정한 계획을 금일 프로젝트 목록에 병합한다. 기존 내용은 지우지 않고 더하기만 한다.
// - 체크한 작업만 반영한다. 새 작업 / 새 프로젝트는 뒤에 추가하고, 폼이 초기 빈 상태면 그 빈 프로젝트를 대체한다.
// - 기존 작업: 진행률을 계획 값으로 맞추고 세부 항목을 덧붙인다(같은 문구는 건너뜀).
// links 는 폼에 들어간 프로젝트·작업·세부 항목 id 와 원래 커밋·제안 문구의 연결이다 — 사용자가 폼에서 이름·문구를
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
    }
  }

  return { projects: isInitial && appended.length ? appended : [...result, ...appended], links };
};
