import { COMMIT_IMPORT_DETAIL_EXAMPLE_LIMIT, COMMIT_TASK_MATCH_THRESHOLD } from '@/constants';
import type {
  ClassifyProgress,
  CommitImportPlan,
  DetailEdit,
  GithubCommit,
  PlannedDetail,
  PlannedProject,
  PlannedTask,
  Project,
  ReportHistoryItem,
  StyleSample,
} from '@/types';
import { commitScope, commitScopeKey, createId, isDiscreteCommit, stripCommitPrefix } from '@/utils';
import { collectStyleSamples, readCommitImportMemory } from '@/lib/commit-classifier/memory';
import { getPromptApiAvailability, openPromptSession, type JsonAsker } from '@/lib/commit-classifier/prompt-api';
import {
  detailStylePrompt,
  detailSuggestionPrompt,
  newTaskNamingPrompt,
  REPO_NONE_ID,
  repoScorePrompt,
  taskScorePrompt,
  type DetailStyleResult,
  type DetailSuggestionResult,
  type NewTaskNamingResult,
  type RepoCandidate,
  type RepoScoreResult,
  type TaskScoreResult,
} from '@/lib/commit-classifier/prompts';

// 최근 보고서에서 세부 항목이 달린 작업 비율이 이보다 낮으면 "세부 항목을 거의 안 쓰는 사용자"로 본다
const DETAIL_USAGE_RATIO = 0.1;
// 비율을 볼 만큼 작업이 쌓이지 않았으면 판단하지 않는다
const DETAIL_USAGE_MIN_TASKS = 10;

// 저장소 → 프로젝트 판정 임계 점수. PoC 에서 같은 제품 9-10, 다른 코드베이스 ≤7 로 갈렸다.
const REPO_MATCH_THRESHOLD = 8;

type ClassifyArgs = {
  // 보정 메모리 주인(회원 id)
  userId: string | null;
  commits: ReadonlyArray<GithubCommit>;
  todayProjects: ReadonlyArray<Project>;
  history: ReadonlyArray<ReportHistoryItem>;
  onProgress: (progress: ClassifyProgress) => void;
};

// 저장소가 붙을 대상: 폼의 기존 프로젝트 또는 새 프로젝트(이름만 정해짐)
type RepoTarget = { kind: 'existing'; project: Project } | { kind: 'new'; name: string };

const repoShortName = (repo: string) => repo.split('/').pop() ?? repo;

// 새 작업 진행률 기본값 — 커밋만으로는 진행률을 알 수 없어, 버그 수정·잡무처럼 하루 단위로 끝나는
// 커밋뿐이면 100%, 기능 개발이 섞여 있으면 50% 로 두고 미리보기에서 고치게 한다.
const defaultNewTaskProgress = (commits: ReadonlyArray<GithubCommit>) =>
  commits.every((c) => isDiscreteCommit(c.message)) ? 100 : 50;

// 같은 저장소 안에서 Conventional Commit scope 가 같은 커밋을 한 묶음으로 본다. scope 가 없으면 단독.
const groupByScope = (commits: ReadonlyArray<GithubCommit>) => {
  const groups = new Map<string, Array<GithubCommit>>();
  for (const commit of commits) {
    const key = `${commit.repo}#${commitScope(commit.message) ?? commit.sha}`;
    groups.set(key, [...(groups.get(key) ?? []), commit]);
  }
  return [...groups.values()];
};

// 같은 프로젝트의 예시를 앞에 두어 문체를 우선 맞추게 한다.
const samplesFor = (samples: ReadonlyArray<StyleSample>, projectName: string) => [
  ...samples.filter((s) => s.projectName === projectName),
  ...samples.filter((s) => s.projectName !== projectName),
];

export async function classifyCommits({
  userId,
  commits,
  todayProjects,
  history,
  onProgress,
}: ClassifyArgs): Promise<CommitImportPlan> {
  const memory = readCommitImportMemory(userId);
  const styleSamples = collectStyleSamples(history);
  const formProjects = todayProjects.filter((p) => p.name.trim());
  const formByName = new Map(formProjects.map((p) => [p.name.trim(), p]));
  const repos = [...new Set(commits.map((c) => c.repo))];

  // 모델이 이미 받아져 있을 때만 AI 를 쓴다. 'downloadable' 이면 규칙 분류로 먼저 보여주고,
  // 미리보기에서 사용자가 내려받기를 누르면 다시 분류한다.
  const availability = await getPromptApiAvailability();
  const session = availability === 'available' ? await openPromptSession().catch(() => null) : null;
  const ask: JsonAsker | null = session?.ask ?? null;

  // 진행률: 저장소 판정 → 작업 판정 → 새 작업 이름짓기. 단계를 지날 때마다 남은 호출 수로 total 을 다시 잡는다.
  let done = 0;
  let total = repos.length * 2;
  const tick = () => onProgress({ stage: 'classify', done: ++done, total });
  // 드물게 응답이 멈춰 타임아웃이 나므로 한 번 더 시도한다. 그래도 실패하면 null — 호출부는 "판정 없음"으로 처리한다.
  const safeAsk = async <T>(prompt: string, schema: object): Promise<T | null> => {
    if (!ask) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ask<T>(prompt, schema);
      } catch {
        // 다음 시도
      }
    }
    return null;
  };

  try {
    // ── 1단계: 저장소 → 프로젝트 ──
    const repoTargets = new Map<string, RepoTarget>();
    for (const repo of repos) {
      const remembered = memory.repoProjects[repo];
      if (remembered) {
        const existing = formByName.get(remembered);
        repoTargets.set(repo, existing ? { kind: 'existing', project: existing } : { kind: 'new', name: remembered });
        tick();
        continue;
      }

      // 후보는 지금 폼의 프로젝트뿐이다. 이전 기록의 프로젝트명까지 후보로 주면(작업 목록 없이 이름만)
      // 무관한 저장소에도 높은 점수를 줘 엉뚱한 과거 프로젝트명이 붙었다 — 과거 연결은 확정 메모리로만 잇는다.
      const candidates: Array<RepoCandidate> = [
        ...formProjects.map((p, i) => ({
          id: `f${i}`,
          name: p.name.trim(),
          tasks: p.tasks.map((t) => t.content.trim()).filter(Boolean),
        })),
      ];
      let target: RepoTarget = { kind: 'new', name: repoShortName(repo) };
      if (candidates.length) {
        const messages = commits.filter((c) => c.repo === repo).map((c) => c.message);
        const { prompt, schema } = repoScorePrompt(candidates, repo, messages);
        const result = await safeAsk<RepoScoreResult>(prompt, schema);
        const best = result
          ? [...result.scores].filter((s) => s.projectId !== REPO_NONE_ID).sort((a, b) => b.score - a.score)[0]
          : null;
        // 작업 판정과 같이 두 번 독립 채점해 둘 다 임계값을 넘을 때만 연결한다(점수가 실행마다 흔들려
        // 무관한 저장소가 기존 프로젝트에 붙는 일이 있었다).
        const confirmed =
          best && best.score >= REPO_MATCH_THRESHOLD
            ? ((await safeAsk<RepoScoreResult>(prompt, schema))?.scores.find((s) => s.projectId === best.projectId)
                ?.score ?? 0) >= REPO_MATCH_THRESHOLD
            : false;
        if (best && confirmed) {
          const index = Number(best.projectId.slice(1));
          if (formProjects[index]) target = { kind: 'existing', project: formProjects[index] };
        } else if (!ask) {
          // 규칙 기반: 저장소 이름과 같은 이름의 프로젝트가 폼에 있으면 연결
          const sameName = formProjects.find((p) => p.name.trim().toLowerCase() === repoShortName(repo).toLowerCase());
          if (sameName) target = { kind: 'existing', project: sameName };
        }
      }
      repoTargets.set(repo, target);
      tick();
    }

    // ── 2단계: 기존 프로젝트로 간 커밋 → 기존 작업 ──
    const projectPlans = new Map<string, PlannedProject>();
    const planFor = (repo: string): PlannedProject => {
      const target = repoTargets.get(repo)!;
      const key = target.kind === 'existing' ? `existing:${target.project.id}` : `new:${target.name}`;
      let plan = projectPlans.get(key);
      if (!plan) {
        plan = {
          key,
          existingProjectId: target.kind === 'existing' ? target.project.id : null,
          name: target.kind === 'existing' ? target.project.name : target.name,
          repos: [],
          tasks: [],
        };
        projectPlans.set(key, plan);
      }
      if (!plan.repos.includes(repo)) plan.repos.push(repo);
      return plan;
    };

    // scope 묶음 단위로 채점한다(커밋 여럿이 문맥을 보태 판정이 안정적). 묶음이 기존 작업에 붙으면
    // 커밋마다(단독 커밋 포함) 그 작업 점수를 한 번 더 받아 두 점수가 모두 임계값 이상일 때만 연결한다.
    // - 넓은 scope 안에 섞인 다른 작업 커밋을 떼어낸다.
    // - 웹 Prompt API 는 temperature/topK 를 받지 않아 같은 입력에도 점수가 흔들린다. 두 번 독립 채점해
    //   "새 작업"을 기존 작업에 잘못 붙이는 오탐을 줄인다(PoC 에서 새 작업 판정 89% → 개선).
    const unmatched = new Map<string, Array<GithubCommit>>();
    const keepUnmatched = (plan: PlannedProject, items: ReadonlyArray<GithubCommit>) =>
      unmatched.set(plan.key, [...(unmatched.get(plan.key) ?? []), ...items]);
    const attach = (plan: PlannedProject, project: Project, taskId: string, commit: GithubCommit) => {
      let task = plan.tasks.find((t) => t.existingTaskId === taskId);
      if (!task) {
        const source = project.tasks.find((t) => t.id === taskId)!;
        task = {
          key: createId(),
          existingTaskId: source.id,
          content: source.content,
          progress: source.progress,
          included: true,
          commits: [],
          details: [],
          suggestedDetails: [],
        };
        plan.tasks.push(task);
      }
      task.commits.push(commit);
    };
    const scoreTasks = async (project: Project, messages: ReadonlyArray<string>) => {
      const { prompt, schema } = taskScorePrompt(project, messages);
      const result = await safeAsk<TaskScoreResult>(prompt, schema);
      tick();
      return result?.scores ?? [];
    };

    // 같은 `저장소#scope` 묶음을 전에 사용자가 어떤 작업명으로 남겼는지(보정 메모리)
    const rememberedTaskNames = new Map<GithubCommit, string>();
    const groups = groupByScope(commits);
    total = done + groups.length + repos.length;
    for (const group of groups) {
      const plan = planFor(group[0].repo);
      const target = repoTargets.get(group[0].repo)!;
      const scopeKey = commitScopeKey(group[0]);
      const rememberedTask = scopeKey ? memory.scopeTasks[scopeKey] : undefined;
      if (rememberedTask) {
        // 폼에 같은 이름의 작업이 있으면 그 작업에, 없으면 그 이름의 새 작업으로 — AI 판정을 건너뛴다
        const sameTask =
          target.kind === 'existing'
            ? target.project.tasks.find((t) => t.content.trim() === rememberedTask)
            : undefined;
        if (target.kind === 'existing' && sameTask) {
          group.forEach((commit) => attach(plan, target.project, sameTask.id, commit));
        } else {
          group.forEach((commit) => rememberedTaskNames.set(commit, rememberedTask));
          keepUnmatched(plan, group);
        }
        continue;
      }
      if (target.kind !== 'existing' || !target.project.tasks.some((t) => t.content.trim())) {
        keepUnmatched(plan, group);
        continue;
      }
      const project = target.project;
      const best = [
        ...(await scoreTasks(
          project,
          group.map((c) => c.message)
        )),
      ].sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < COMMIT_TASK_MATCH_THRESHOLD) {
        keepUnmatched(plan, group);
        continue;
      }
      total += group.length;
      for (const commit of group) {
        const score = (await scoreTasks(project, [commit.message])).find((s) => s.taskId === best.taskId)?.score ?? 0;
        if (score >= COMMIT_TASK_MATCH_THRESHOLD) attach(plan, project, best.taskId, commit);
        else keepUnmatched(plan, [commit]);
      }
    }

    // ── 3단계: 새 작업 묶기 + 이름짓기 (이전 기록 문체) ──
    total = done + unmatched.size;
    for (const [planKey, pending] of unmatched) {
      const plan = projectPlans.get(planKey)!;
      // 보정 메모리에 작업명이 있는 커밋은 그 이름으로 바로 묶는다
      for (const commit of pending.filter((c) => rememberedTaskNames.has(c))) {
        const name = rememberedTaskNames.get(commit)!;
        const existing = plan.tasks.find((t) => t.existingTaskId === null && t.content === name);
        if (existing) existing.commits.push(commit);
        else plan.tasks.push(newTask(name, [commit]));
      }
      const groups = groupByScope(pending.filter((c) => !rememberedTaskNames.has(c)));
      if (!groups.length) {
        tick();
        continue;
      }
      const assigned = new Set<number>();
      const { prompt, schema } = newTaskNamingPrompt(
        plan.name,
        groups.map((g) => g.map((c) => c.message)),
        samplesFor(styleSamples, plan.name)
      );
      const result = await safeAsk<NewTaskNamingResult>(prompt, schema);
      for (const item of result?.items ?? []) {
        // 모델이 같은 번호를 한 항목에 두 번 넣는 경우가 있어 중복을 걷어낸다
        const members = [...new Set(item.groups)].filter((n) => groups[n] && !assigned.has(n));
        if (!members.length || !item.titleKo.trim()) continue;
        members.forEach((n) => assigned.add(n));
        const memberCommits = members.flatMap((n) => groups[n]);
        plan.tasks.push(newTask(item.titleKo.trim(), memberCommits));
      }
      // AI 가 빠뜨렸거나 쓸 수 없을 때: 그룹 첫 커밋 제목으로 작업을 만든다
      groups.forEach((group, n) => {
        if (!assigned.has(n)) plan.tasks.push(newTask(stripCommitPrefix(group[0].message), group));
      });
      tick();
    }

    // ── 4단계: 세부 항목 — AI 가 필요하다고 판단한 작업에만 만든다 ──
    // 커밋 하나로 새로 만든 작업은 작업명이 곧 그 커밋이라 묻지 않는다(호출 절약). 사용자가 세부 항목을
    // 거의 쓰지 않거나 제안을 자주 지웠다면 더 아끼도록 프롬프트에 알린다.
    const plans = [...projectPlans.values()];
    const sparse = !usesDetails(history) || memory.detailFeedback.removed > memory.detailFeedback.kept;
    const needsAsk = plans.flatMap((p) => p.tasks).filter((t) => t.existingTaskId !== null || t.commits.length > 1);
    total = done + needsAsk.length + (memory.detailEdits.length ? 1 : 0);
    if (ask) {
      for (const task of needsAsk) {
        const { prompt, schema } = detailSuggestionPrompt(
          task.content,
          task.commits.map((c) => c.message),
          sparse
        );
        const result = await safeAsk<DetailSuggestionResult>(prompt, schema);
        tick();
        // 작업명에 이미 들어 있는 말을 되풀이하는 줄은 버린다(PoC 에서 가끔 커밋 제목을 그대로 옮겼다)
        const lines = [...new Set((result?.details ?? []).map(cleanLine).filter(Boolean))].filter(
          (line) => !isRedundantWithTask(line, task.content)
        );
        task.details = lines.map((line) => ({ key: createId(), content: line, suggested: line }));
        task.suggestedDetails = lines;
      }
      await applyDetailStyle(plans, memory.detailEdits, safeAsk);
    }

    return { projects: [...projectPlans.values()], classifier: ask ? 'ai' : 'rule', aiAvailability: availability };
  } finally {
    session?.close();
  }
}

// 최근 보고서(최대 20건)의 작업 중 세부 항목을 단 비율로 이 사용자가 세부 항목을 쓰는지 본다.
function usesDetails(history: ReadonlyArray<ReportHistoryItem>): boolean {
  const tasks = [...history]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20)
    .flatMap((item) => item.todayProjects.flatMap((p) => p.tasks.filter((t) => t.content.trim())));
  if (tasks.length < DETAIL_USAGE_MIN_TASKS) return true;
  const withDetails = tasks.filter((t) => (t.details ?? []).some((d) => d.content.trim())).length;
  return withDetails / tasks.length >= DETAIL_USAGE_RATIO;
}

function newTask(content: string, commits: ReadonlyArray<GithubCommit>): PlannedTask {
  return {
    key: createId(),
    existingTaskId: null,
    content,
    progress: defaultNewTaskProgress(commits),
    included: true,
    commits: [...commits],
    details: [],
    suggestedDetails: [],
  };
}

const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase();
const isRedundantWithTask = (line: string, task: string) => {
  const a = normalize(line);
  const b = normalize(task);
  return a === b || b.includes(a) || a.includes(b);
};

// 모델이 입력 목록의 불릿·번호까지 따라 쓰는 경우가 있어 걷어낸다
const cleanLine = (line: string) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim();

// 세부 항목 표기 보정 메모리 적용(AI 가 만든 세부 항목에만).
// 1) 같은 제안 문구를 전에 고친 적이 있으면 그 문구를 그대로 쓴다.
// 2) 나머지는 최근 보정 예시를 보여 주고 사용자 표기로 한 번에 다시 쓰게 한다. 줄 수가 어긋나면 원래 문구를 둔다.
async function applyDetailStyle(
  projects: ReadonlyArray<PlannedProject>,
  edits: ReadonlyArray<DetailEdit>,
  ask: <T>(prompt: string, schema: object) => Promise<T | null>
) {
  if (!edits.length) return;
  const details = projects.flatMap((p) => p.tasks.flatMap((t) => t.details));
  const exact = new Map(edits.map((e) => [e.original, e.edited]));
  const rest: Array<PlannedDetail> = [];
  for (const detail of details) {
    const known = exact.get(detail.content);
    if (known) {
      detail.content = known;
      detail.suggested = known;
    } else {
      rest.push(detail);
    }
  }
  if (!rest.length) return;
  const { prompt, schema } = detailStylePrompt(
    edits.slice(0, COMMIT_IMPORT_DETAIL_EXAMPLE_LIMIT),
    rest.map((d) => d.content)
  );
  const result = await ask<DetailStyleResult>(prompt, schema);
  if (!result || result.lines.length !== rest.length) return;
  rest.forEach((detail, index) => {
    const line = cleanLine(result.lines[index] ?? '');
    if (!line) return;
    detail.content = line;
    detail.suggested = line;
  });
}
