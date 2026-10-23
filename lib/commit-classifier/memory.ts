import {
  COMMIT_IMPORT_DETAIL_EDIT_LIMIT,
  COMMIT_IMPORT_IMPORTED_TASK_LIMIT,
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
  ImportedTask,
  ProgressEdit,
  Project,
  ReportHistoryItem,
  StyleSample,
} from '@/types';
import { commitScopeKey } from '@/utils';
import { createClient } from '@/lib/supabase/client';

// 커밋 가져오기의 사용자별 보정 메모리(Supabase `commit_import_memories` 에 회원당 한 행, JSONB).
// 1) 저장소 → 프로젝트명: 다음 가져오기에서 AI 판정 없이 바로 그 프로젝트에 붙인다.
//    (예: `todo-report-generator` 로 가져온 뒤 "일일 업무 보고 서비스" 로 고쳐 저장했다면 다음부터 그 이름으로)
// 2) `저장소#scope` → 작업명: 같은 묶음의 커밋을 그 작업에 붙이거나 그 이름으로 새 작업을 만든다.
// 3) 세부 항목: AI 제안 문구 → 사용자가 고친 문구 쌍을 예시로 넘겨 새 제안을 사용자 표기로 바꾸고,
//    제안을 지운 / 남긴 횟수와 사용자가 직접 추가한 줄 수로 다음 제안을 얼마나 아낄지 정한다.
// 4) 진행률: 새 작업에 제안한 진행률 → 사용자가 고친 진행률 쌍을 예시로 넘겨 다음 유추가 사용자 성향을 따르게 한다.
// 5) 제외한 저장소: 개인 프로젝트처럼 보고서에 넣지 않을 저장소는 커밋 조회부터 건너뛴다.
//    매번 작업을 하나도 넣지 않고 적용하는 저장소는 횟수를 세 두었다가 미리보기에서 제외를 제안한다.
// 6) 가져온 작업(등록 기록): 가져와 보고서에 넣은 새 작업의 보고서 날짜·AI 원래 이름·사용자 최종 이름·커밋을 남겨 두고,
//    같은 날짜 보고서로 다시 가져올 때 같은 작업이 잡히면 "기존 작업과 유사"로 가져오기를 해제해 둔다(`registered-tasks.ts`).
// 보정은 미리보기에서 확정할 때 한 번(사용자가 고친 것만), 폼에서 더 고친 뒤 보고서를 저장(복사)할 때 다시 읽어 반영한다.
// 회원과 함께 기기를 옮겨 다니도록 DB 에 둔다. 예전에 브라우저 localStorage 에 쌓인 기록은 처음 읽을 때 옮기고 지운다.

const emptyMemory = (): CommitImportMemory => ({
  repoProjects: {},
  scopeTasks: {},
  detailEdits: [],
  detailFeedback: { removed: 0, kept: 0, added: 0 },
  progressEdits: [],
  excludedRepos: [],
  repoSkips: {},
  importedTasks: [],
  pendingLinks: [],
});

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

// 새 기록을 앞에 쌓는다. 커밋이 겹치는 예전 기록은 같은 작업을 다시 넣은 것이라 지운다.
const pushImportedTasks = (current: ReadonlyArray<ImportedTask>, records: ReadonlyArray<ImportedTask>) => {
  const shas = new Set(records.flatMap((r) => r.shas));
  const ids = new Set(records.map((r) => r.id));
  return [...records, ...current.filter((r) => !ids.has(r.id) && !r.shas.some((sha) => shas.has(sha)))].slice(
    0,
    COMMIT_IMPORT_IMPORTED_TASK_LIMIT
  );
};

const TABLE = 'commit_import_memories';

const normalizeMemory = (raw: Partial<CommitImportMemory> | null | undefined): CommitImportMemory => ({
  repoProjects: raw?.repoProjects ?? {},
  scopeTasks: raw?.scopeTasks ?? {},
  detailEdits: raw?.detailEdits ?? [],
  detailFeedback: { removed: 0, kept: 0, added: 0, ...raw?.detailFeedback },
  progressEdits: raw?.progressEdits ?? [],
  excludedRepos: raw?.excludedRepos ?? [],
  repoSkips: raw?.repoSkips ?? {},
  importedTasks: raw?.importedTasks ?? [],
  pendingLinks: raw?.pendingLinks ?? [],
});

// 예전 저장 위치(회원 id 별 localStorage). 읽어서 DB 로 옮긴 뒤 지운다.
const legacyStorageKey = (userId: string) => `${COMMIT_IMPORT_MEMORY_STORAGE_KEY}:${userId}`;

const readLegacyMemory = (userId: string): CommitImportMemory | null => {
  try {
    const raw = localStorage.getItem(legacyStorageKey(userId));
    return raw ? normalizeMemory(JSON.parse(raw) as Partial<CommitImportMemory>) : null;
  } catch {
    return null;
  }
};

const clearLegacyMemory = (userId: string) => {
  try {
    localStorage.removeItem(legacyStorageKey(userId));
  } catch {
    // 지우지 못해도 다음에 다시 합칠 뿐이다(합치기는 같은 기록을 두 번 더하지 않는다)
  }
};

// 기기마다 따로 쌓인 예전 기록을 DB 기록에 합친다. 겹치는 값은 DB 쪽을 우선하고, 목록은 합치고, 횟수는 큰 쪽을 쓴다
// (같은 기록을 다시 합쳐도 늘어나지 않게 더하지 않는다).
const mergeMemories = (remote: CommitImportMemory, local: CommitImportMemory): CommitImportMemory => {
  const maxCounts = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(
      [...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, Math.max(a[k] ?? 0, b[k] ?? 0)])
    );
  const linkKeys = new Set(remote.pendingLinks.map((l) => JSON.stringify(l)));
  return {
    repoProjects: { ...local.repoProjects, ...remote.repoProjects },
    scopeTasks: { ...local.scopeTasks, ...remote.scopeTasks },
    detailEdits: pushDetailEdits(local.detailEdits, remote.detailEdits),
    detailFeedback: {
      removed: Math.max(remote.detailFeedback.removed, local.detailFeedback.removed),
      kept: Math.max(remote.detailFeedback.kept, local.detailFeedback.kept),
      added: Math.max(remote.detailFeedback.added, local.detailFeedback.added),
    },
    progressEdits: pushProgressEdits(local.progressEdits, remote.progressEdits),
    excludedRepos: [...new Set([...remote.excludedRepos, ...local.excludedRepos])].sort(),
    repoSkips: maxCounts(remote.repoSkips, local.repoSkips),
    importedTasks: pushImportedTasks(local.importedTasks, remote.importedTasks),
    pendingLinks: [...remote.pendingLinks, ...local.pendingLinks.filter((l) => !linkKeys.has(JSON.stringify(l)))].slice(
      0,
      COMMIT_IMPORT_PENDING_LINK_LIMIT
    ),
  };
};

const selectMemory = async (userId: string): Promise<CommitImportMemory | null> => {
  const { data, error } = await createClient().from(TABLE).select('memory').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? normalizeMemory((data as { memory: Partial<CommitImportMemory> }).memory) : null;
};

const upsertMemory = async (userId: string, memory: CommitImportMemory) => {
  const { error } = await createClient()
    .from(TABLE)
    .upsert({ user_id: userId, memory, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
};

// DB 에서 읽는다. 이 기기에 예전 localStorage 기록이 남아 있으면 합쳐 저장하고 지운다(저장에 실패하면 남겨 둔다).
const loadMemory = async (userId: string): Promise<CommitImportMemory> => {
  const remote = await selectMemory(userId);
  const legacy = readLegacyMemory(userId);
  if (!legacy) return remote ?? emptyMemory();
  const merged = remote ? mergeMemories(remote, legacy) : legacy;
  await upsertMemory(userId, merged);
  clearLegacyMemory(userId);
  return merged;
};

// 한 탭 안의 쓰기는 차례로 돌려(작업 추가 직후 보고서 저장 등) 앞선 쓰기를 덮지 않게 하고, 읽기도 앞선 쓰기를 기다린다.
// 다른 기기와 동시에 쓰면 나중 쓰기가 이긴다 — 쓰기마다 직전에 다시 읽어 그 틈을 좁힌다.
let writeQueue: Promise<void> = Promise.resolve();

const updateMemory = (userId: string | null, change: (memory: CommitImportMemory) => CommitImportMemory | null) => {
  if (!userId) return Promise.resolve();
  writeQueue = writeQueue
    .then(async () => {
      const next = change(await loadMemory(userId));
      if (next) await upsertMemory(userId, next);
    })
    .catch((error) => console.error('[commit-import-memory] write failed', error));
  return writeQueue;
};

// 회원의 보정 메모리. 게스트면 빈 메모리. DB 를 읽지 못하면(마이그레이션 적용 전 등) 이 기기에 남은 예전 기록,
// 그것도 없으면 빈 메모리 — 기억하지 못해도 분류는 동작한다.
export const readCommitImportMemory = async (userId: string | null): Promise<CommitImportMemory> => {
  if (!userId) return emptyMemory();
  await writeQueue;
  try {
    return await loadMemory(userId);
  } catch (error) {
    console.error('[commit-import-memory] read failed', error);
    return readLegacyMemory(userId) ?? emptyMemory();
  }
};

// 설정 > 저장된 데이터 관리에서 서버 기록을 지우기 직전에 부른다. 진행 중인 쓰기를 기다리고 이 기기에 남은 예전 기록도
// 지운다 — 남겨 두면 다음에 읽을 때 DB 로 다시 합쳐져 지운 기록이 되살아난다.
export const clearLocalCommitImportMemory = async (userId: string) => {
  await writeQueue;
  clearLegacyMemory(userId);
};

// 미리보기에서 사용자가 고친 내용을 기억하고, 폼에 들어간 항목 연결을 저장 대기로 남긴다.
// 프로젝트명·작업명은 분류 결과(original)와 달라진 것만 기억한다 — AI 판정을 그대로 받아들인 것까지 여기서 기억하면
// 보고서를 저장하지 않고 폼을 비워도 다음 분류(다시 분류 포함)가 AI 를 건너뛰고 같은 결과만 되풀이한다.
// 고치지 않은 판정은 보고서를 저장할 때(`learnFromSavedReport`) 확정한다.
export const rememberCommitImport = (
  userId: string | null,
  plan: CommitImportPlan,
  original: CommitImportPlan,
  links: ReadonlyArray<CommitImportLink>,
  reportDateKey: string
) =>
  updateMemory(userId, (memory) => {
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
    // 이번에 작업을 하나도 넣지 않은 저장소는 횟수를 올리고, 하나라도 넣은 저장소는 처음부터 다시 센다.
    // 이미 등록한 작업과 비슷해 해제해 둔 작업만 있는 저장소는 세지 않는다 — 뺀 게 아니라 이미 넣은 것이라
    // 그 저장소 제외를 제안할 근거가 아니다.
    const repoSkips = { ...memory.repoSkips };
    const plannedTasks = plan.projects.flatMap((p) => p.tasks);
    const includedRepos = new Set(
      plannedTasks.filter((t) => t.included && t.content.trim()).flatMap((t) => t.commits.map((c) => c.repo))
    );
    const freshRepos = new Set(
      plannedTasks.filter((t) => t.similarTo === null).flatMap((t) => t.commits.map((c) => c.repo))
    );
    for (const repo of new Set(plan.projects.flatMap((p) => p.repos))) {
      if (includedRepos.has(repo)) delete repoSkips[repo];
      else if (freshRepos.has(repo)) repoSkips[repo] = (repoSkips[repo] ?? 0) + 1;
    }
    // 폼에 새로 넣은 작업을 등록 기록으로 남긴다. suggested 는 AI 가 처음 지은 이름(분류 결과), final 은 지금 이름이다.
    const records: Array<ImportedTask> = [];
    for (const link of links) {
      if (link.kind !== 'imported') continue;
      const task = plannedTasks.find((t) => t.key === link.recordId);
      if (!task) continue;
      const final = task.content.trim();
      records.push({
        id: link.recordId,
        reportDate: reportDateKey,
        suggested: originalTaskName(task.commits[0]?.sha ?? '') ?? final,
        final,
        repos: [...new Set(task.commits.map((c) => c.repo))],
        shas: task.commits.map((c) => c.sha),
        messages: task.commits.map((c) => c.message),
        saved: false,
      });
    }
    return {
      ...memory,
      repoProjects,
      scopeTasks,
      repoSkips,
      detailEdits: pushDetailEdits(memory.detailEdits, edits),
      detailFeedback: feedback,
      progressEdits: pushProgressEdits(memory.progressEdits, progressEdits),
      importedTasks: pushImportedTasks(memory.importedTasks, records),
      pendingLinks: [...links, ...memory.pendingLinks].slice(0, COMMIT_IMPORT_PENDING_LINK_LIMIT),
    };
  });

// 보고서를 저장할 때 호출 — 가져온 항목들이 폼에서 최종적으로 어떤 이름·문구가 됐는지 읽어 기억한다.
// reportDateKey 는 저장하는 보고서 날짜 — 가져온 뒤 날짜를 바꿔 저장했으면 등록 기록도 그 날짜로 옮긴다.
// 작업이 남아 있는데 제안 세부 항목만 지워졌다면 "제안이 필요 없었다"로 센다. 사라진 항목의 연결은 버리고,
// 남은 연결은 두어 같은 날 다시 고쳐 저장해도 반영된다.
export const learnFromSavedReport = (userId: string | null, projects: ReadonlyArray<Project>, reportDateKey: string) =>
  updateMemory(userId, (memory) => {
    if (!memory.pendingLinks.length) return null;
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
    // 등록 기록: 저장된 작업은 최종 이름으로 확정하고, 확정 전에 폼에서 지운 작업은 기록에서 뺀다
    const importedTasks = new Map(memory.importedTasks.map((r) => [r.id, r]));

    for (const link of memory.pendingLinks) {
      const project = projects.find((p) => p.id === link.projectId);
      if (link.kind === 'imported') {
        const record = importedTasks.get(link.recordId);
        const task = project?.tasks.find((t) => t.id === link.taskId);
        if (!record) continue;
        if (!task || !task.content.trim()) {
          if (!record.saved) importedTasks.delete(link.recordId);
          continue;
        }
        importedTasks.set(link.recordId, {
          ...record,
          final: task.content.trim(),
          reportDate: reportDateKey,
          saved: true,
        });
        alive.push(link);
        continue;
      }
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

    return {
      ...memory,
      repoProjects,
      scopeTasks,
      detailEdits: pushDetailEdits(memory.detailEdits, edits),
      detailFeedback: feedback,
      progressEdits: pushProgressEdits(memory.progressEdits, progressEdits),
      importedTasks: [...importedTasks.values()],
      pendingLinks: alive,
    };
  });

// 제외 목록에 저장소를 넣거나 뺀 결과
export const toggleExcludedRepo = (repos: ReadonlyArray<string>, repo: string, excluded: boolean): Array<string> =>
  excluded ? [...new Set([...repos, repo])].sort() : repos.filter((r) => r !== repo);

// 저장소를 분류 대상에서 빼거나 다시 넣는다. 화면은 `toggleExcludedRepo` 로 바로 반영하고 저장은 뒤에서 한다.
// 건너뛴 횟수는 어느 쪽이든 지운다 — 제외를 해제한 저장소를 곧바로 다시 제외하라고 제안하지 않게.
export const setRepoExcluded = (userId: string | null, repo: string, excluded: boolean) =>
  updateMemory(userId, (memory) => {
    const repoSkips = { ...memory.repoSkips };
    delete repoSkips[repo];
    return { ...memory, excludedRepos: toggleExcludedRepo(memory.excludedRepos, repo, excluded), repoSkips };
  });

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
