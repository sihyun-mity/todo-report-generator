import {
  COMMIT_IMPORT_DETAIL_EDIT_LIMIT,
  COMMIT_IMPORT_MEMORY_STORAGE_KEY,
  COMMIT_IMPORT_PENDING_LINK_LIMIT,
  COMMIT_IMPORT_PROGRESS_EDIT_LIMIT,
  COMMIT_IMPORT_REPO_SKIP_SUGGEST_COUNT,
  COMMIT_IMPORT_STYLE_SAMPLE_LIMIT,
} from '@/constants';
import type {
  CommitImportLink,
  CommitImportMemory,
  CommitImportPlan,
  DetailEdit,
  ProgressEdit,
  Project,
  ReportHistoryItem,
  StyleSample,
} from '@/types';
import { commitScopeKey } from '@/utils';

// 커밋 가져오기의 사용자별 보정 메모리(회원 id 별 localStorage).
// 1) 저장소 → 프로젝트명: 다음 가져오기에서 AI 판정 없이 바로 그 프로젝트에 붙인다.
//    (예: `todo-report-generator` 로 가져온 뒤 "일일 업무 보고 서비스" 로 고쳐 저장했다면 다음부터 그 이름으로)
// 2) `저장소#scope` → 작업명: 같은 묶음의 커밋을 그 작업에 붙이거나 그 이름으로 새 작업을 만든다.
// 3) 세부 항목: AI 제안 문구 → 사용자가 고친 문구 쌍을 예시로 넘겨 새 제안을 사용자 표기로 바꾸고,
//    제안을 지운 / 남긴 횟수와 사용자가 직접 추가한 줄 수로 다음 제안을 얼마나 아낄지 정한다.
// 4) 진행률: 새 작업에 제안한 진행률 → 사용자가 고친 진행률 쌍을 예시로 넘겨 다음 유추가 사용자 성향을 따르게 한다.
// 5) 제외한 저장소: 개인 프로젝트처럼 보고서에 넣지 않을 저장소는 커밋 조회부터 건너뛴다.
//    매번 작업을 하나도 넣지 않고 적용하는 저장소는 횟수를 세 두었다가 미리보기에서 제외를 제안한다.
// 보정은 미리보기에서 확정할 때 한 번(사용자가 고친 것만), 폼에서 더 고친 뒤 보고서를 저장(복사)할 때 다시 읽어 반영한다.

const emptyMemory = (): CommitImportMemory => ({
  repoProjects: {},
  scopeTasks: {},
  detailEdits: [],
  detailFeedback: { removed: 0, kept: 0, added: 0 },
  progressEdits: [],
  excludedRepos: [],
  repoSkips: {},
  pendingLinks: [],
});

const storageKey = (userId: string) => `${COMMIT_IMPORT_MEMORY_STORAGE_KEY}:${userId}`;

export const readCommitImportMemory = (userId: string | null): CommitImportMemory => {
  if (!userId) return emptyMemory();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as Partial<CommitImportMemory>;
    return {
      repoProjects: parsed.repoProjects ?? {},
      scopeTasks: parsed.scopeTasks ?? {},
      detailEdits: parsed.detailEdits ?? [],
      detailFeedback: { removed: 0, kept: 0, added: 0, ...parsed.detailFeedback },
      progressEdits: parsed.progressEdits ?? [],
      excludedRepos: parsed.excludedRepos ?? [],
      repoSkips: parsed.repoSkips ?? {},
      pendingLinks: parsed.pendingLinks ?? [],
    };
  } catch {
    return emptyMemory();
  }
};

const writeMemory = (userId: string, memory: CommitImportMemory) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(memory));
  } catch {
    // 저장 공간 부족 / 차단 — 기억하지 못해도 기능은 동작한다
  }
};

// 같은 원문은 최신 보정 하나만 남기고 앞에 쌓는다.
const pushDetailEdits = (current: ReadonlyArray<DetailEdit>, edits: ReadonlyArray<DetailEdit>) => {
  const fresh = edits.filter((e) => e.edited.trim() && e.edited.trim() !== e.original.trim());
  const originals = new Set(fresh.map((e) => e.original));
  return [...fresh, ...current.filter((e) => !originals.has(e.original))].slice(0, COMMIT_IMPORT_DETAIL_EDIT_LIMIT);
};

// 같은 커밋 묶음은 최신 보정 하나만 남기고 앞에 쌓는다. 제안 그대로인 값은 보정이 아니다.
const progressEditKey = (edit: ProgressEdit) => edit.commits.join('\n');
const pushProgressEdits = (current: ReadonlyArray<ProgressEdit>, edits: ReadonlyArray<ProgressEdit>) => {
  const fresh = edits.filter((e) => e.edited !== e.suggested);
  const keys = new Set(fresh.map(progressEditKey));
  return [...fresh, ...current.filter((e) => !keys.has(progressEditKey(e)))].slice(
    0,
    COMMIT_IMPORT_PROGRESS_EDIT_LIMIT
  );
};

// 미리보기에서 사용자가 고친 내용을 기억하고, 폼에 들어간 항목 연결을 저장 대기로 남긴다.
// 프로젝트명·작업명은 분류 결과(original)와 달라진 것만 기억한다 — AI 판정을 그대로 받아들인 것까지 여기서 기억하면
// 보고서를 저장하지 않고 폼을 비워도 다음 분류(다시 분류 포함)가 AI 를 건너뛰고 같은 결과만 되풀이한다.
// 고치지 않은 판정은 보고서를 저장할 때(`learnFromSavedReport`) 확정한다.
export const rememberCommitImport = (
  userId: string | null,
  plan: CommitImportPlan,
  original: CommitImportPlan,
  links: ReadonlyArray<CommitImportLink>
) => {
  if (!userId) return;
  const memory = readCommitImportMemory(userId);
  const repoProjects = { ...memory.repoProjects };
  const scopeTasks = { ...memory.scopeTasks };
  const edits: Array<DetailEdit> = [];
  const progressEdits: Array<ProgressEdit> = [];
  const feedback = { ...memory.detailFeedback };
  const originalProjectName = (repo: string) => original.projects.find((p) => p.repos.includes(repo))?.name.trim();
  const originalTaskName = (sha: string) =>
    original.projects
      .flatMap((p) => p.tasks)
      .find((t) => t.commits.some((c) => c.sha === sha))
      ?.content.trim();
  for (const project of plan.projects) {
    const included = project.tasks.filter((t) => t.included && t.content.trim());
    const name = project.name.trim();
    if (!name || !included.length) continue;
    for (const repo of project.repos) {
      if (name !== originalProjectName(repo)) repoProjects[repo] = name;
    }
    for (const task of included) {
      const content = task.content.trim();
      for (const commit of task.commits) {
        const scopeKey = commitScopeKey(commit);
        if (scopeKey && content !== originalTaskName(commit.sha)) scopeTasks[scopeKey] = content;
      }
      if (task.suggestedProgress !== null && task.progress !== task.suggestedProgress) {
        progressEdits.push({
          task: content,
          commits: task.commits.map((c) => c.message),
          suggested: task.suggestedProgress,
          edited: task.progress,
        });
      }
      // AI 제안 세부 항목: 미리보기에서 지운 개수 / 남긴 개수, 그리고 사용자가 고친 문구
      for (const suggested of task.suggestedDetails) {
        const detail = task.details.find((d) => d.suggested === suggested);
        if (!detail || !detail.content.trim()) {
          feedback.removed += 1;
          continue;
        }
        feedback.kept += 1;
        if (detail.content.trim() !== suggested) edits.push({ original: suggested, edited: detail.content.trim() });
      }
      // 사용자가 미리보기에서 직접 추가한 세부 항목
      feedback.added += task.details.filter((d) => d.suggested === null && d.content.trim()).length;
    }
  }
  // 이번에 작업을 하나도 넣지 않은 저장소는 횟수를 올리고, 하나라도 넣은 저장소는 처음부터 다시 센다
  const repoSkips = { ...memory.repoSkips };
  const includedRepos = new Set(
    plan.projects.flatMap((p) =>
      p.tasks.filter((t) => t.included && t.content.trim()).flatMap((t) => t.commits.map((c) => c.repo))
    )
  );
  for (const repo of new Set(plan.projects.flatMap((p) => p.repos))) {
    if (includedRepos.has(repo)) delete repoSkips[repo];
    else repoSkips[repo] = (repoSkips[repo] ?? 0) + 1;
  }
  writeMemory(userId, {
    ...memory,
    repoProjects,
    scopeTasks,
    repoSkips,
    detailEdits: pushDetailEdits(memory.detailEdits, edits),
    detailFeedback: feedback,
    progressEdits: pushProgressEdits(memory.progressEdits, progressEdits),
    pendingLinks: [...links, ...memory.pendingLinks].slice(0, COMMIT_IMPORT_PENDING_LINK_LIMIT),
  });
};

// 보고서를 저장할 때 호출 — 가져온 항목들이 폼에서 최종적으로 어떤 이름·문구가 됐는지 읽어 기억한다.
// 작업이 남아 있는데 제안 세부 항목만 지워졌다면 "제안이 필요 없었다"로 센다. 사라진 항목의 연결은 버리고,
// 남은 연결은 두어 같은 날 다시 고쳐 저장해도 반영된다.
export const learnFromSavedReport = (userId: string | null, projects: ReadonlyArray<Project>) => {
  if (!userId) return;
  const memory = readCommitImportMemory(userId);
  if (!memory.pendingLinks.length) return;
  const repoProjects = { ...memory.repoProjects };
  const scopeTasks = { ...memory.scopeTasks };
  const edits: Array<DetailEdit> = [];
  const progressEdits: Array<ProgressEdit> = [];
  const feedback = { ...memory.detailFeedback };
  const alive: Array<CommitImportLink> = [];
  // 같은 작업을 여러 번 가져오면(다시 가져와 기존 작업에 세부 항목을 덧붙인 경우) 작업마다 `details` 연결이 여럿 생긴다.
  // 앞선 연결의 known 에는 뒤에 AI 가 넣은 줄이 없어 그 줄을 "직접 추가"로 잘못 센다 — 작업 단위로 known 과
  // AI 제안 줄(`detail` 연결)을 모두 합쳐 판단하고, 작업마다 한 번만 센다.
  const taskKey = (link: { projectId: string; taskId: string }) => `${link.projectId}:${link.taskId}`;
  const knownDetails = new Map<string, Set<string>>();
  for (const link of memory.pendingLinks) {
    if (link.kind !== 'details' && link.kind !== 'detail') continue;
    const known = knownDetails.get(taskKey(link)) ?? new Set<string>();
    if (link.kind === 'details') link.known.forEach((id) => known.add(id));
    else known.add(link.detailId);
    knownDetails.set(taskKey(link), known);
  }
  const countedTasks = new Set<string>();

  for (const link of memory.pendingLinks) {
    const project = projects.find((p) => p.id === link.projectId);
    if (!project) continue;
    if (link.kind === 'project') {
      if (project.name.trim()) repoProjects[link.repo] = project.name.trim();
      alive.push(link);
      continue;
    }
    const task = project.tasks.find((t) => t.id === link.taskId);
    if (!task) continue;
    if (link.kind === 'task') {
      if (task.content.trim()) scopeTasks[link.scopeKey] = task.content.trim();
      alive.push(link);
      continue;
    }
    if (link.kind === 'details') {
      // 폼에 넣은 뒤 사용자가 직접 추가한 세부 항목. 센 줄은 known 에 더해 다시 저장해도 두 번 세지 않고,
      // 같은 작업의 나머지 `details` 연결은 이 하나로 합쳐 버린다.
      const key = taskKey(link);
      if (countedTasks.has(key)) continue;
      countedTasks.add(key);
      const known = knownDetails.get(key) ?? new Set<string>();
      const added = task.details.filter((d) => !known.has(d.id) && d.content.trim()).map((d) => d.id);
      feedback.added += added.length;
      alive.push({ ...link, known: [...known, ...added] });
      continue;
    }
    if (link.kind === 'progress') {
      // 폼에 넣은 뒤 사용자가 진행률을 고친 경우만. 예시의 기준은 처음 제안한 값(suggested)이다.
      if (task.progress !== link.inserted) {
        progressEdits.push({
          task: task.content.trim() || link.task,
          commits: link.commits,
          suggested: link.suggested,
          edited: task.progress,
        });
        alive.push({ ...link, inserted: task.progress });
        continue;
      }
      alive.push(link);
      continue;
    }
    const detail = task.details.find((d) => d.id === link.detailId);
    if (!detail || !detail.content.trim()) {
      feedback.removed += 1;
      continue;
    }
    // 폼에 넣은 뒤 사용자가 문구를 고친 경우만
    if (detail.content.trim() !== link.inserted) {
      edits.push({ original: link.original, edited: detail.content.trim() });
      alive.push({ ...link, inserted: detail.content.trim() });
      continue;
    }
    alive.push(link);
  }

  writeMemory(userId, {
    ...memory,
    repoProjects,
    scopeTasks,
    detailEdits: pushDetailEdits(memory.detailEdits, edits),
    detailFeedback: feedback,
    progressEdits: pushProgressEdits(memory.progressEdits, progressEdits),
    pendingLinks: alive,
  });
};

// 저장소를 분류 대상에서 빼거나 다시 넣고, 바뀐 제외 목록을 돌려준다.
// 건너뛴 횟수는 어느 쪽이든 지운다 — 제외를 해제한 저장소를 곧바로 다시 제외하라고 제안하지 않게.
export const setRepoExcluded = (userId: string | null, repo: string, excluded: boolean): Array<string> => {
  const memory = readCommitImportMemory(userId);
  const excludedRepos = excluded
    ? [...new Set([...memory.excludedRepos, repo])].sort()
    : memory.excludedRepos.filter((r) => r !== repo);
  const repoSkips = { ...memory.repoSkips };
  delete repoSkips[repo];
  if (userId) writeMemory(userId, { ...memory, excludedRepos, repoSkips });
  return excludedRepos;
};

// 작업을 하나도 넣지 않고 적용한 일이 연속으로 쌓인 저장소 — 미리보기에서 제외를 제안한다
export const repoExcludeSuggestions = (memory: CommitImportMemory): Array<string> =>
  Object.entries(memory.repoSkips)
    .filter(([, count]) => count >= COMMIT_IMPORT_REPO_SKIP_SUGGEST_COUNT)
    .map(([repo]) => repo);

// 최근 보고서부터 훑어 작업명 예시를 모은다. 같은 문구는 한 번만 넣는다.
export const collectStyleSamples = (history: ReadonlyArray<ReportHistoryItem>): Array<StyleSample> => {
  const seen = new Set<string>();
  const samples: Array<StyleSample> = [];
  const recentFirst = [...history].sort((a, b) => b.timestamp - a.timestamp);
  for (const item of recentFirst) {
    for (const project of item.todayProjects) {
      for (const task of project.tasks) {
        const content = task.content.trim();
        if (!content || seen.has(content)) continue;
        seen.add(content);
        samples.push({ projectName: project.name.trim(), taskContent: content });
        if (samples.length >= COMMIT_IMPORT_STYLE_SAMPLE_LIMIT) return samples;
      }
    }
  }
  return samples;
};
