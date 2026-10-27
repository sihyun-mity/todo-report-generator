import {
  COMMIT_CLASSIFY_PROMPT_TIMEOUT_MS,
  COMMIT_IMPORT_DEFAULT_PROGRESS,
  COMMIT_IMPORT_DETAIL_EXAMPLE_LIMIT,
  COMMIT_IMPORT_PROGRESS_EXAMPLE_LIMIT,
  COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE,
  COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE,
  COMMIT_TASK_MATCH_THRESHOLD,
} from '@/constants';
import { COMMIT_CLASSIFY_STAGE } from '@/enums';
import type {
  ClassifyProgress,
  ClassifyStageProgress,
  ClassifyThought,
  CommitClassifyStage,
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
import { commitScope, commitScopeKey, createId, reportItemDateKey, stripCommitPrefix } from '@/utils';
import { collectStyleSamples, readCommitImportMemory } from '@/lib/commit-classifier/memory';
import { readScores, readStringArray, readStringValues } from '@/lib/commit-classifier/partial-json';
import {
  findRegisteredTask,
  findSimilarFormTask,
  isReportedCommit,
  similarTaskCandidates,
} from '@/lib/commit-classifier/registered-tasks';
import { getPromptApiAvailability, type JsonAsker, openPromptSession } from '@/lib/prompt-api';
import {
  detailStylePrompt,
  type DetailStyleResult,
  detailSuggestionPrompt,
  type DetailSuggestionResult,
  newTaskNamingPrompt,
  type NewTaskNamingResult,
  progressPrompt,
  type ProgressResult,
  similarTaskScorePrompt,
  type SimilarTaskScoreResult,
  REPO_NONE_ID,
  type RepoCandidate,
  repoScorePrompt,
  type RepoScoreResult,
  taskScorePrompt,
  type TaskScoreResult,
} from '@/lib/commit-classifier/prompts';

// 최근 보고서에서 세부 항목이 달린 작업 비율이 이보다 낮으면 "세부 항목을 거의 안 쓰는 사용자"로 본다
const DETAIL_USAGE_RATIO = 0.1;
// 비율을 볼 만큼 작업이 쌓이지 않았으면 판단하지 않는다
const DETAIL_USAGE_MIN_TASKS = 10;
// 비율을 셀 최근 보고서 수
const DETAIL_USAGE_RECENT_REPORTS = 20;

// 저장소 → 프로젝트 판정 임계 점수. PoC 에서 같은 제품 9-10, 다른 코드베이스 ≤7 로 갈렸다.
const REPO_MATCH_THRESHOLD = 8;

type ClassifyArgs = {
  // 보정 메모리 주인(회원 id)
  userId: string | null;
  commits: ReadonlyArray<GithubCommit>;
  todayProjects: ReadonlyArray<Project>;
  // todayProjects 에 섞인 오늘의 목표 작업 id — 커밋을 붙일 후보로는 쓰되, 아직 보고서에 넣은 작업이 아니므로
  // "이미 등록한 작업"(비슷하면 해제)으로 견주지 않는다
  goalTaskIds?: ReadonlySet<string>;
  // 가져오는 보고서 날짜('YYYY-MM-DD') — 이미 등록한 작업은 이 날짜에 넣은 것만 견준다
  reportDateKey: string;
  history: ReadonlyArray<ReportHistoryItem>;
  onProgress: (progress: ClassifyProgress) => void;
  // AI 판단 과정(분류 중 화면 표시용). AI 를 쓸 때만 불린다.
  onThinking: (thought: ClassifyThought) => void;
  // 중단되면 남은 모델 호출을 하지 않고 AbortError 로 끝난다. 중단 뒤에는 onProgress / onThinking 을 부르지 않는다.
  signal?: AbortSignal;
};

// 판단 과정 한 단계를 띄우고, 모델 응답을 read 로 읽어 갱신(onText)하다가 결과로 마무리(conclude)한다
type Think = (
  title: string,
  read?: (text: string) => Array<string>
) => { onText: (text: string) => void; conclude: (conclusion: string) => void };

// 저장소가 붙을 대상: 폼의 기존 프로젝트 또는 새 프로젝트(이름만 정해짐)
type RepoTarget = { kind: 'existing'; project: Project } | { kind: 'new'; name: string };

const repoShortName = (repo: string) => repo.split('/').pop() ?? repo;

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
  goalTaskIds,
  reportDateKey,
  history,
  onProgress: reportProgress,
  onThinking: reportThinking,
  signal,
}: ClassifyArgs): Promise<CommitImportPlan> {
  // 중단된 분류가 새 분류의 진행 표시를 덮어쓰지 않게 한다
  const onProgress = (value: ClassifyProgress) => !signal?.aborted && reportProgress(value);
  const onThinking = (value: ClassifyThought) => !signal?.aborted && reportThinking(value);
  const memory = await readCommitImportMemory(userId);
  const styleSamples = collectStyleSamples(history);
  const formProjects = todayProjects.filter((p) => p.name.trim());
  const formByName = new Map(formProjects.map((p) => [p.name.trim(), p]));
  const repos = [...new Set(commits.map((c) => c.repo))];

  // 진행률은 단계별로 센다. 전체 호출 수는 앞 단계 판정에 따라 달라져 미리 알 수 없지만, 단계 안의 개수는
  // 그 단계를 시작할 때 정해진다(재확인처럼 도중에 늘어나는 호출은 grow 로 더한다).
  const progress: ClassifyProgress = { current: null, stages: {} };
  const emit = () => onProgress({ current: progress.current, stages: { ...progress.stages } });
  const startStage = (stage: CommitClassifyStage, total: number) => {
    progress.current = stage;
    progress.stages[stage] = { done: 0, total };
    emit();
  };
  const updateStage = (change: (current: ClassifyStageProgress) => ClassifyStageProgress) => {
    const stage = progress.current;
    const current = stage && progress.stages[stage];
    if (!stage || !current) return;
    progress.stages[stage] = change(current);
    emit();
  };
  const tick = () => updateStage(({ done, total }) => ({ done: done + 1, total }));
  const grow = (count: number) => updateStage(({ done, total }) => ({ done, total: total + count }));

  // 모델이 이미 받아져 있을 때만 AI 를 쓴다. 'downloadable' 이면 규칙 분류로 먼저 보여주고,
  // 미리보기에서 사용자가 내려받기를 누르면 다시 분류한다. 세션 생성(모델 적재)이 오래 걸릴 수 있어 단계로 보여 준다.
  startStage(COMMIT_CLASSIFY_STAGE.PREPARE, 0);
  const availability = await getPromptApiAvailability();
  signal?.throwIfAborted();
  const session =
    availability === 'available'
      ? await openPromptSession({ signal, timeoutMs: COMMIT_CLASSIFY_PROMPT_TIMEOUT_MS }).catch(() => null)
      : null;
  const ask: JsonAsker | null = session?.ask ?? null;
  // 드물게 응답이 멈춰 타임아웃이 나므로 한 번 더 시도한다. 그래도 실패하면 null — 호출부는 "판정 없음"으로 처리한다.
  // 모든 모델 호출이 여기를 지나므로 중단은 여기서 던져 분류 전체를 끝낸다(판정 없음으로 삼켜 계속하지 않게).
  const safeAsk = async <T>(prompt: string, schema: object, onText?: (text: string) => void): Promise<T | null> => {
    signal?.throwIfAborted();
    if (!ask) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ask<T>(prompt, schema, onText);
      } catch {
        // 중단이면 다시 시도하지 않고 끝낸다
        signal?.throwIfAborted();
      }
    }
    return null;
  };

  // 판단 과정 표시: 단계마다 제목을 띄우고, 모델 응답이 생성되는 대로 read 로 읽어 낸 줄을 갱신한다.
  let thoughtSeq = 0;
  const think: Think = (title, read = () => []) => {
    const id = ++thoughtSeq;
    let lines: Array<string> = [];
    if (ask) onThinking({ id, title, lines, conclusion: null });
    return {
      onText: (text: string) => {
        lines = read(text);
        onThinking({ id, title, lines, conclusion: null });
      },
      conclude: (conclusion: string) => {
        if (ask) onThinking({ id, title, lines, conclusion });
      },
    };
  };
  const scoreLines = (idKey: string, names: ReadonlyMap<string, string>) => (text: string) =>
    readScores(text, idKey).map(({ id, score }) => `${names.get(id) ?? id} — ${score}점`);
  const quote = (text: string) => `“${text}”`;

  try {
    // ── 1단계: 저장소 → 프로젝트 ── (저장소마다 한 칸 — 재확인 호출이 있어도 저장소 단위)
    startStage(COMMIT_CLASSIFY_STAGE.REPO, repos.length);
    const repoTargets = new Map<string, RepoTarget>();
    for (const repo of repos) {
      const remembered = memory.repoProjects[repo];
      if (remembered) {
        const existing = formByName.get(remembered);
        repoTargets.set(repo, existing ? { kind: 'existing', project: existing } : { kind: 'new', name: remembered });
        think(`${repo} 저장소`).conclude(`전에 정한 대로 ${quote(remembered)} 프로젝트에 정리해요`);
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
        const names = new Map([...candidates.map((c) => [c.id, c.name] as const), [REPO_NONE_ID, '별도 코드베이스']]);
        const thought = think(`${repo} 저장소가 어느 프로젝트인지 보고 있어요`, scoreLines('projectId', names));
        const result = await safeAsk<RepoScoreResult>(prompt, schema, thought.onText);
        const best = result
          ? [...result.scores].filter((s) => s.projectId !== REPO_NONE_ID).sort((a, b) => b.score - a.score)[0]
          : null;
        // 작업 판정과 같이 두 번 독립 채점해 둘 다 임계값을 넘을 때만 연결한다(점수가 실행마다 흔들려
        // 무관한 저장소가 기존 프로젝트에 붙는 일이 있었다).
        const recheck =
          best && best.score >= REPO_MATCH_THRESHOLD
            ? think(
                `${quote(names.get(best.projectId) ?? '')} 프로젝트가 맞는지 한 번 더 채점하고 있어요`,
                scoreLines('projectId', names)
              )
            : null;
        const confirmed =
          best && recheck
            ? ((await safeAsk<RepoScoreResult>(prompt, schema, recheck.onText))?.scores.find(
                (s) => s.projectId === best.projectId
              )?.score ?? 0) >= REPO_MATCH_THRESHOLD
            : false;
        recheck?.conclude(confirmed ? '두 번 모두 높은 점수예요' : '점수가 엇갈려 연결하지 않아요');
        if (best && confirmed) {
          const index = Number(best.projectId.slice(1));
          if (formProjects[index]) target = { kind: 'existing', project: formProjects[index] };
        } else if (!ask) {
          // 규칙 기반: 저장소 이름과 같은 이름의 프로젝트가 폼에 있으면 연결
          const sameName = formProjects.find((p) => p.name.trim().toLowerCase() === repoShortName(repo).toLowerCase());
          if (sameName) target = { kind: 'existing', project: sameName };
        }
        thought.conclude(
          target.kind === 'existing'
            ? `${quote(target.project.name)} 프로젝트에 정리해요`
            : `새 프로젝트 ${quote(target.name)}(으)로 정리해요`
        );
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
          suggestedProgress: null,
          included: true,
          commits: [],
          details: [],
          suggestedDetails: [],
          similarTo: null,
        };
        plan.tasks.push(task);
      }
      task.commits.push(commit);
    };
    const scoreTasks = async (project: Project, messages: ReadonlyArray<string>, title: string) => {
      const { prompt, schema } = taskScorePrompt(project, messages);
      const names = new Map(project.tasks.map((t) => [t.id, t.content.trim()]));
      // summary 는 모델이 커밋을 어떻게 이해했는지 스스로 적은 문장이라 점수보다 먼저 보여 준다
      const thought = think(title, (text) => [
        ...readStringValues(text, 'summary')
          .map((line) => line.trim())
          .filter(Boolean),
        ...scoreLines('taskId', names)(text),
      ]);
      const result = await safeAsk<TaskScoreResult>(prompt, schema, thought.onText);
      tick();
      return { scores: result?.scores ?? [], thought, names };
    };

    // 같은 `저장소#scope` 묶음을 전에 사용자가 어떤 작업명으로 남겼는지(보정 메모리).
    // scope 는 기능 영역 단위로 넓게 쓰이기도 해(`store` 아래 서로 다른 작업 여럿) 기억한 이름을 그대로 쓰면 무관한 커밋까지
    // 그 작업으로 묶였다. 기억한 작업명을 후보 하나로 두고 기존 작업 판정처럼 묶음 채점 → 커밋마다 재채점해 두 점수가 모두
    // 임계값 이상인 커밋만 그 이름으로 보내고, 나머지는 평소 판정으로 넘긴다. AI 를 쓸 수 없으면 기억대로 둔다.
    const rememberedTaskNames = new Map<GithubCommit, string>();
    const REMEMBERED_TASK_ID = 'remembered';
    const confirmRememberedTask = async (
      scopeKey: string,
      name: string,
      group: ReadonlyArray<GithubCommit>
    ): Promise<ReadonlyArray<GithubCommit>> => {
      if (!ask) return group;
      const candidate: Project = {
        id: REMEMBERED_TASK_ID,
        name: '',
        tasks: [{ id: REMEMBERED_TASK_ID, content: name, progress: 0, details: [] }],
      };
      const scoreOf = (scores: TaskScoreResult['scores']) =>
        scores.find((s) => s.taskId === REMEMBERED_TASK_ID)?.score ?? 0;
      // 이 확인 호출은 묶음 한 칸과 별도로 센다 — 떨어진 커밋은 이어서 평소 판정에서 다시 센다
      grow(1);
      const first = await scoreTasks(
        candidate,
        group.map((c) => c.message),
        `${scopeKey} 커밋 ${group.length}건이 전에 정한 ${quote(name)} 작업인지 보고 있어요`
      );
      if (scoreOf(first.scores) < COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE) {
        first.thought.conclude('전에 정한 작업과 달라 다시 판정해요');
        return [];
      }
      first.thought.conclude(`${quote(name)} 작업일 가능성이 높아요 — 커밋마다 다시 확인해요`);
      grow(group.length);
      const confirmed: Array<GithubCommit> = [];
      for (const commit of group) {
        const recheck = await scoreTasks(
          candidate,
          [commit.message],
          `${quote(stripCommitPrefix(commit.message))} 커밋이 ${quote(name)} 작업인지 확인하고 있어요`
        );
        if (scoreOf(recheck.scores) >= COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE) {
          recheck.thought.conclude(`전에 정한 대로 ${quote(name)} 작업으로 정리해요`);
          confirmed.push(commit);
        } else {
          recheck.thought.conclude('점수가 낮아 다시 판정해요');
        }
      }
      return confirmed;
    };

    const groups = groupByScope(commits);
    startStage(COMMIT_CLASSIFY_STAGE.TASK, groups.length);
    for (const scopeGroup of groups) {
      const plan = planFor(scopeGroup[0].repo);
      const target = repoTargets.get(scopeGroup[0].repo)!;
      const scopeKey = commitScopeKey(scopeGroup[0]);
      const rememberedTask = scopeKey ? memory.scopeTasks[scopeKey] : undefined;
      let group: ReadonlyArray<GithubCommit> = scopeGroup;
      if (scopeKey && rememberedTask) {
        const confirmed = await confirmRememberedTask(scopeKey, rememberedTask, scopeGroup);
        // 폼에 같은 이름의 작업이 있으면 그 작업에, 없으면 그 이름의 새 작업으로
        const sameTask =
          target.kind === 'existing'
            ? target.project.tasks.find((t) => t.content.trim() === rememberedTask)
            : undefined;
        if (target.kind === 'existing' && sameTask) {
          confirmed.forEach((commit) => attach(plan, target.project, sameTask.id, commit));
        } else {
          confirmed.forEach((commit) => rememberedTaskNames.set(commit, rememberedTask));
          keepUnmatched(plan, confirmed);
        }
        group = scopeGroup.filter((commit) => !confirmed.includes(commit));
        if (!group.length) {
          tick();
          continue;
        }
      }
      if (target.kind !== 'existing' || !target.project.tasks.some((t) => t.content.trim())) {
        keepUnmatched(plan, group);
        tick();
        continue;
      }
      const project = target.project;
      const { scores, thought, names } = await scoreTasks(
        project,
        group.map((c) => c.message),
        `${quote(project.name)}의 기존 작업 중 커밋 ${group.length}건에 맞는 작업을 찾고 있어요`
      );
      const best = [...scores].sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < COMMIT_TASK_MATCH_THRESHOLD) {
        thought.conclude('맞는 기존 작업이 없어 새 작업으로 모아요');
        keepUnmatched(plan, group);
        continue;
      }
      const bestName = quote(names.get(best.taskId) ?? '');
      thought.conclude(`${bestName} 작업일 가능성이 높아요 — 커밋마다 다시 확인해요`);
      grow(group.length);
      for (const commit of group) {
        const recheck = await scoreTasks(
          project,
          [commit.message],
          `${quote(stripCommitPrefix(commit.message))} 커밋이 ${bestName} 작업인지 확인하고 있어요`
        );
        const score = recheck.scores.find((s) => s.taskId === best.taskId)?.score ?? 0;
        if (score >= COMMIT_TASK_MATCH_THRESHOLD) {
          recheck.thought.conclude(`${bestName} 작업에 붙여요`);
          attach(plan, project, best.taskId, commit);
        } else {
          recheck.thought.conclude('점수가 낮아 새 작업 쪽으로 돌려요');
          keepUnmatched(plan, [commit]);
        }
      }
    }

    // ── 3단계: 새 작업 묶기 + 이름짓기 (이전 기록 문체) ──
    startStage(COMMIT_CLASSIFY_STAGE.NAMING, unmatched.size);
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
      const thought = think(
        `${quote(plan.name)}의 새 작업 ${groups.length}묶음을 정리하고 이름을 짓고 있어요`,
        (text) =>
          readStringValues(text, 'titleKo')
            .map((title) => title.trim())
            .filter(Boolean)
      );
      const result = await safeAsk<NewTaskNamingResult>(prompt, schema, thought.onText);
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
      thought.conclude(`새 작업 ${plan.tasks.filter((t) => t.existingTaskId === null).length}개로 정리했어요`);
      tick();
    }

    // ── 이미 등록한 작업 알아보기 ──
    // 이 보고서 날짜에 이미 넣은 작업이 다시 잡히면 가져오기를 해제해 프로젝트 작업 목록 맨 아래로 보낸다.
    // 견줄 대상은 ① 이 날짜에 가져와 넣은 작업(등록 기록 — AI 원래 이름·사용자 최종 이름·커밋) ② 폼에 직접 적은 작업.
    // 확실한 경우(같은 커밋·제목 겹침·이름이 거의 같음)는 문자열로 바로 정하고, 이름이 애매하게 비슷한 후보만 AI 에
    // 두 번 채점시켜 둘 다 임계값을 넘을 때 같은 작업으로 본다(표현만 다른 같은 작업). 사용자가 다시 체크하면 그대로 들어간다.
    // 폼의 기존 작업에 붙은 묶음은 커밋이 모두 이미 보고된 것일 때만 뺀다 — 새 커밋이 섞였으면 이어서 한 일이다.
    const registered = memory.importedTasks.filter((r) => r.reportDate === reportDateKey);
    // 이 날짜 보고서를 마지막으로 저장한 시각(저장 전이면 null)
    const savedAtMs = history
      .filter((item) => reportItemDateKey(item) === reportDateKey)
      .reduce<number | null>((latest, item) => Math.max(latest ?? 0, item.timestamp), null);
    // 계획이 들어갈 폼 프로젝트 — 기존 프로젝트, 또는 폼 반영 때 이름이 같아 합쳐질 프로젝트
    const formProjectOf = (plan: PlannedProject) =>
      plan.existingProjectId !== null
        ? formProjects.find((p) => p.id === plan.existingProjectId)
        : formByName.get(plan.name.trim());
    // 오늘의 목표는 아직 넣은 작업이 아니라 견주지 않는다 — 목표와 비슷한 새 작업이 "이미 넣은 작업"으로 해제됐다
    const reportedTasksOf = (plan: PlannedProject) =>
      (formProjectOf(plan)?.tasks ?? []).filter((t) => t.content.trim() && !goalTaskIds?.has(t.id));
    const hasFormTasks = [...projectPlans.values()].some((plan) => reportedTasksOf(plan).length > 0);
    if (registered.length || hasFormTasks) {
      let similarCount = 0;
      const markSimilar = (task: PlannedTask, name: string) => {
        task.similarTo = name;
        task.included = false;
        similarCount += 1;
      };
      for (const plan of projectPlans.values()) {
        const formTasks = reportedTasksOf(plan);
        for (const task of plan.tasks) {
          if (task.existingTaskId !== null) {
            if (task.commits.length && task.commits.every((c) => isReportedCommit(c, registered, savedAtMs))) {
              const name = task.content.trim();
              think(`${quote(name)} 작업`).conclude('이미 보고한 커밋뿐이라 다시 넣지 않고 빼 둘게요');
              markSimilar(task, name);
            }
            continue;
          }
          const similarTo =
            findRegisteredTask(task, registered)?.final ?? findSimilarFormTask(task, formTasks)?.content.trim() ?? null;
          if (similarTo !== null) {
            think(`${quote(task.content)} 작업`).conclude(`이미 넣은 ${quote(similarTo)} 작업과 같아 빼 둘게요`);
            markSimilar(task, similarTo);
            continue;
          }
          if (!ask) continue;
          const candidates = similarTaskCandidates(task, registered, formTasks).map((c, i) => ({ ...c, id: `r${i}` }));
          if (!candidates.length) continue;
          const { prompt, schema } = similarTaskScorePrompt(
            task.content,
            task.commits.map((c) => c.message),
            candidates
          );
          const names = new Map(candidates.map((c) => [c.id, c.label]));
          const lines = (text: string) => [
            ...readStringValues(text, 'summary')
              .map((line) => line.trim())
              .filter(Boolean),
            ...scoreLines('taskId', names)(text),
          ];
          const thought = think(`${quote(task.content)}이(가) 이미 넣은 작업과 같은지 보고 있어요`, lines);
          const result = await safeAsk<SimilarTaskScoreResult>(prompt, schema, thought.onText);
          const best = [...(result?.scores ?? [])].sort((a, b) => b.score - a.score)[0];
          if (!best || best.score < COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE) {
            thought.conclude('다른 작업이에요');
            continue;
          }
          const bestName = names.get(best.taskId) ?? '';
          thought.conclude(`${quote(bestName)} 작업과 같아 보여요 — 한 번 더 확인해요`);
          const recheck = think(`${quote(task.content)}이(가) ${quote(bestName)} 작업인지 다시 채점하고 있어요`, lines);
          const again = await safeAsk<SimilarTaskScoreResult>(prompt, schema, recheck.onText);
          const confirmed =
            (again?.scores.find((s) => s.taskId === best.taskId)?.score ?? 0) >= COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE;
          recheck.conclude(confirmed ? '두 번 모두 같은 작업이라 빼 둘게요' : '점수가 엇갈려 새 작업으로 둬요');
          if (confirmed) markSimilar(task, bestName);
        }
        plan.tasks = [
          ...plan.tasks.filter((t) => t.similarTo === null),
          ...plan.tasks.filter((t) => t.similarTo !== null),
        ];
      }
      if (similarCount) think('이미 넣은 작업 확인').conclude(`${similarCount}개는 이미 넣은 작업과 같아 빼 둘게요`);
    }

    // ── 4단계: 새 작업 진행률 — 커밋 제목으로 가늠한다(프로젝트마다 한 번) ──
    // 기존 작업은 사용자가 적어 둔 진행률을 그대로 둔다. AI 가 없거나 판정이 빠진 작업은 기본값(100)이다.
    const plansWithNewTasks = [...projectPlans.values()].filter((p) => p.tasks.some((t) => t.existingTaskId === null));
    startStage(COMMIT_CLASSIFY_STAGE.PROGRESS, ask ? plansWithNewTasks.length : 0);
    if (ask) {
      const examples = memory.progressEdits.slice(0, COMMIT_IMPORT_PROGRESS_EXAMPLE_LIMIT);
      for (const plan of plansWithNewTasks) {
        const tasks = plan.tasks.filter((t) => t.existingTaskId === null);
        const candidates = tasks.map((t, i) => ({
          id: `t${i}`,
          title: t.content,
          messages: t.commits.map((c) => c.message),
        }));
        const { prompt, schema } = progressPrompt(plan.name, candidates, examples);
        const names = new Map(candidates.map((c) => [c.id, c.title]));
        const thought = think(
          `${quote(plan.name)}의 새 작업 ${tasks.length}개가 얼마나 끝났는지 계산하고 있어요`,
          (text) => readScores(text, 'taskId', 'progress').map(({ id, score }) => `${names.get(id) ?? id} — ${score}%`)
        );
        const result = await safeAsk<ProgressResult>(prompt, schema, thought.onText);
        tick();
        for (const item of result?.items ?? []) {
          const task = tasks[Number(item.taskId.slice(1))];
          if (!task || !Number.isFinite(item.progress)) continue;
          const value = Math.min(100, Math.max(0, Math.round(item.progress)));
          task.progress = value;
          task.suggestedProgress = value;
        }
        const unfinished = tasks.filter((t) => t.progress < 100).length;
        thought.conclude(unfinished ? `${unfinished}개는 아직 진행 중으로 봐요` : '모두 끝난 작업으로 봐요');
      }
    }

    // ── 5단계: 세부 항목 — AI 가 필요하다고 판단한 작업에만 만든다 ──
    // 커밋 하나로 새로 만든 작업은 작업명이 곧 그 커밋이라 묻지 않는다(호출 절약). 사용자가 세부 항목을
    // 거의 쓰지 않거나 제안을 자주 지웠다면 더 아끼도록 프롬프트에 알린다.
    const plans = [...projectPlans.values()];
    // 사용자가 세부 항목을 직접 추가한 줄도 "세부 항목을 원한다"로 센다 — 지운 횟수만 보면 한 번 아끼기 시작한 뒤 되돌아오지 않는다
    const { removed, kept, added } = memory.detailFeedback;
    const sparse = !usesDetails(history) || removed > kept + added;
    // 이미 등록한 작업과 비슷해 해제해 둔 작업은 묻지 않는다 — 대개 넣지 않으므로 호출을 아낀다
    const needsAsk = plans
      .flatMap((p) => p.tasks)
      .filter((t) => t.similarTo === null && (t.existingTaskId !== null || t.commits.length > 1));
    // AI 가 없으면 묻지 않으므로 할 일이 없는 단계(건너뜀)가 된다
    startStage(COMMIT_CLASSIFY_STAGE.DETAIL, ask ? needsAsk.length + (memory.detailEdits.length ? 1 : 0) : 0);
    if (ask) {
      for (const task of needsAsk) {
        const { prompt, schema } = detailSuggestionPrompt(
          task.content,
          task.commits.map((c) => c.message),
          sparse
        );
        // reason 은 모델이 세부 항목이 필요한지 스스로 적은 판단 근거다
        const thought = think(`${quote(task.content)}에 세부 항목이 필요한지 보고 있어요`, (text) => [
          ...readStringValues(text, 'reason')
            .map((line) => line.trim())
            .filter(Boolean),
          ...readStringArray(text, 'details').map((line) => `· ${line}`),
        ]);
        const result = await safeAsk<DetailSuggestionResult>(prompt, schema, thought.onText);
        tick();
        // 작업명에 이미 들어 있는 말을 되풀이하는 줄은 버린다(PoC 에서 가끔 커밋 제목을 그대로 옮겼다)
        const lines = [...new Set((result?.details ?? []).map(cleanLine).filter(Boolean))].filter(
          (line) => !isRedundantWithTask(line, task.content)
        );
        task.details = lines.map((line) => ({ key: createId(), content: line, suggested: line }));
        task.suggestedDetails = lines;
        thought.conclude(lines.length ? `세부 항목 ${lines.length}개를 제안해요` : '세부 항목 없이 둬요');
      }
      await applyDetailStyle(plans, memory.detailEdits, safeAsk, think);
      // 표기 보정 몫으로 더한 한 칸 — 중간에 끝나(전부 정확히 일치·세부 항목 없음) 호출하지 않았어도 채운다
      if (memory.detailEdits.length) tick();
    }

    progress.current = null;
    emit();

    return { projects: [...projectPlans.values()], classifier: ask ? 'ai' : 'rule', aiAvailability: availability };
  } finally {
    session?.close();
  }
}

// 최근 보고서(최대 `DETAIL_USAGE_RECENT_REPORTS` 건)의 작업 중 세부 항목을 단 비율로 이 사용자가 세부 항목을 쓰는지 본다.
function usesDetails(history: ReadonlyArray<ReportHistoryItem>): boolean {
  const tasks = [...history]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, DETAIL_USAGE_RECENT_REPORTS)
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
    progress: COMMIT_IMPORT_DEFAULT_PROGRESS,
    suggestedProgress: COMMIT_IMPORT_DEFAULT_PROGRESS,
    included: true,
    commits: [...commits],
    details: [],
    suggestedDetails: [],
    similarTo: null,
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
  ask: <T>(prompt: string, schema: object, onText?: (text: string) => void) => Promise<T | null>,
  think: Think
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
  const thought = think('전에 고친 표기대로 세부 항목 문구를 다듬고 있어요', (text) =>
    readStringArray(text, 'lines').map((line) => `· ${line}`)
  );
  const result = await ask<DetailStyleResult>(prompt, schema, thought.onText);
  if (!result || result.lines.length !== rest.length) {
    thought.conclude('원래 문구를 그대로 둬요');
    return;
  }
  thought.conclude(`${rest.length}줄을 다듬었어요`);
  rest.forEach((detail, index) => {
    const line = cleanLine(result.lines[index] ?? '');
    if (!line) return;
    detail.content = line;
    detail.suggested = line;
  });
}
