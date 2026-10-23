import {
  COMMIT_IMPORT_DETAIL_EDIT_LIMIT,
  COMMIT_IMPORT_MEMORY_STORAGE_KEY,
  COMMIT_IMPORT_PENDING_LINK_LIMIT,
  COMMIT_IMPORT_STYLE_SAMPLE_LIMIT,
} from '@/constants';
import type {
  CommitImportLink,
  CommitImportMemory,
  CommitImportPlan,
  DetailEdit,
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
//    제안을 지운 / 남긴 횟수로 다음 제안을 얼마나 아낄지 정한다.
// 4) 제외한 저장소: 개인 프로젝트처럼 보고서에 넣지 않을 저장소는 커밋 조회부터 건너뛴다.
// 보정은 미리보기에서 확정할 때 한 번, 폼에서 더 고친 뒤 보고서를 저장(복사)할 때 다시 읽어 반영한다.

const emptyMemory = (): CommitImportMemory => ({
  repoProjects: {},
  scopeTasks: {},
  detailEdits: [],
  detailFeedback: { removed: 0, kept: 0 },
  excludedRepos: [],
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
      detailFeedback: parsed.detailFeedback ?? { removed: 0, kept: 0 },
      excludedRepos: parsed.excludedRepos ?? [],
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

// 미리보기에서 확정한 내용을 기억하고, 폼에 들어간 항목 연결을 저장 대기로 남긴다.
export const rememberCommitImport = (
  userId: string | null,
  plan: CommitImportPlan,
  links: ReadonlyArray<CommitImportLink>
) => {
  if (!userId) return;
  const memory = readCommitImportMemory(userId);
  const repoProjects = { ...memory.repoProjects };
  const scopeTasks = { ...memory.scopeTasks };
  const edits: Array<DetailEdit> = [];
  const feedback = { ...memory.detailFeedback };
  for (const project of plan.projects) {
    const included = project.tasks.filter((t) => t.included && t.content.trim());
    const name = project.name.trim();
    if (!name || !included.length) continue;
    for (const repo of project.repos) repoProjects[repo] = name;
    for (const task of included) {
      for (const commit of task.commits) {
        const scopeKey = commitScopeKey(commit);
        if (scopeKey) scopeTasks[scopeKey] = task.content.trim();
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
    }
  }
  writeMemory(userId, {
    ...memory,
    repoProjects,
    scopeTasks,
    detailEdits: pushDetailEdits(memory.detailEdits, edits),
    detailFeedback: feedback,
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
  const feedback = { ...memory.detailFeedback };
  const alive: Array<CommitImportLink> = [];

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
    pendingLinks: alive,
  });
};

// 저장소를 분류 대상에서 빼거나 다시 넣고, 바뀐 제외 목록을 돌려준다.
export const setRepoExcluded = (userId: string | null, repo: string, excluded: boolean): Array<string> => {
  const memory = readCommitImportMemory(userId);
  const excludedRepos = excluded
    ? [...new Set([...memory.excludedRepos, repo])].sort()
    : memory.excludedRepos.filter((r) => r !== repo);
  if (userId) writeMemory(userId, { ...memory, excludedRepos });
  return excludedRepos;
};

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
