import {
  COMMIT_IMPORT_SIMILAR_TASK_AI_CANDIDATE_LIMIT,
  COMMIT_IMPORT_SIMILAR_TASK_AI_MIN,
  COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD,
} from '@/constants';
import type { ImportedTask, PlannedTask, Task } from '@/types';
import { stripCommitPrefix } from '@/utils';

// 이미 보고서에 넣은 작업이 이번 분류에서 다시 잡혔는지 알아본다. 같은 보고서 날짜의 작업만 견준다 — 다른 날 이어서 한
// 일은 그날 보고서에 다시 넣을 일이라 빼 두지 않는다.
// 가져와 넣은 작업(보정 메모리의 `importedTasks`, 호출부가 날짜로 거른다):
// 1) 같은 커밋(sha)이 들어 있으면 같은 작업이다 — 보고서를 저장하기 전에 다시 가져온 경우.
// 2) 커밋 제목이 절반 이상 겹치면 같은 작업이다 — rebase·cherry-pick 으로 sha 만 바뀐 경우.
// 3) 같은 저장소에서 작업명이 AI 가 전에 지은 이름(suggested) 또는 사용자가 고쳐 넣은 이름(final)과 비슷하면 같은 작업으로 본다.
//    바로 넣은 작업은 AI 가 비슷한 이름을 다시 내고, 고쳐 넣은 작업은 고치기 전 이름과 비슷하게 나오므로 둘 다 견준다.
//    저장소가 겹칠 때만 이름을 견준다 — "버그 수정" 같은 흔한 이름이 무관한 프로젝트 작업과 이어지지 않게.
// 폼에 직접 적은 작업(`findSimilarFormTask`): 커밋 연결이 없어 이름 유사도만 본다.
// 위는 확실한 경우라 문자열로 바로 정한다(AI 점수는 실행마다 흔들린다). 이름 유사도가 애매한 구간의 후보만
// `similarTaskCandidates` 로 골라 AI 에 묻는다(`similarTaskScorePrompt`) — 표현만 다른 같은 작업을 잡으려고.

const normalize = (text: string) =>
  stripCommitPrefix(text)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');

const bigrams = (text: string) => {
  const result: Array<string> = [];
  for (let i = 0; i < text.length - 1; i++) result.push(text.slice(i, i + 2));
  return result;
};

// 글자 bigram Dice 계수(0-1). 한 글자짜리는 같을 때만 1.
export const textSimilarity = (a: string, b: string): number => {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const xs = bigrams(x);
  const ys = bigrams(y);
  if (!xs.length || !ys.length) return 0;
  const pool = new Map<string, number>();
  ys.forEach((g) => pool.set(g, (pool.get(g) ?? 0) + 1));
  let shared = 0;
  for (const g of xs) {
    const left = pool.get(g) ?? 0;
    if (!left) continue;
    shared += 1;
    pool.set(g, left - 1);
  }
  return (2 * shared) / (xs.length + ys.length);
};

// task 와 같은 작업으로 보이는 등록 기록. 여럿이면 가장 가까운 것.
export const findRegisteredTask = (
  task: Pick<PlannedTask, 'content' | 'commits'>,
  records: ReadonlyArray<ImportedTask>
): ImportedTask | null => {
  const shas = new Set(task.commits.map((c) => c.sha));
  const messages = task.commits.map((c) => normalize(c.message)).filter(Boolean);
  const repos = new Set(task.commits.map((c) => c.repo));
  let best: { record: ImportedTask; score: number } | null = null;
  for (const record of records) {
    if (record.shas.some((sha) => shas.has(sha))) return record;
    const known = new Set(record.messages.map(normalize));
    const overlap = messages.filter((m) => known.has(m)).length;
    if (messages.length && overlap * 2 >= messages.length) return record;
    if (!record.repos.some((repo) => repos.has(repo))) continue;
    const score = Math.max(textSimilarity(task.content, record.suggested), textSimilarity(task.content, record.final));
    if (score >= COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD && (!best || score > best.score)) best = { record, score };
  }
  return best?.record ?? null;
};

// task 와 이름이 비슷한 폼 작업(같은 프로젝트). 여럿이면 가장 가까운 것.
export const findSimilarFormTask = (
  task: Pick<PlannedTask, 'content'>,
  formTasks: ReadonlyArray<Task>
): Task | null => {
  let best: { task: Task; score: number } | null = null;
  for (const formTask of formTasks) {
    const score = textSimilarity(task.content, formTask.content);
    if (score >= COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD && (!best || score > best.score))
      best = { task: formTask, score };
  }
  return best?.task ?? null;
};

// AI 에 물을 후보 — 위에서 정하지 못한 작업과 이름 유사도가 애매한 구간(AI_MIN 이상 ~ 임계값 미만)인 등록 기록·폼 작업.
// names 는 모델에 보여 줄 이름들(등록 기록은 AI 원래 이름과 사용자 최종 이름), label 은 배지에 보일 이름이다.
export type SimilarTaskCandidate = { label: string; names: Array<string>; score: number };

export const similarTaskCandidates = (
  task: Pick<PlannedTask, 'content' | 'commits'>,
  records: ReadonlyArray<ImportedTask>,
  formTasks: ReadonlyArray<Task>
): Array<SimilarTaskCandidate> => {
  const repos = new Set(task.commits.map((c) => c.repo));
  const candidates: Array<SimilarTaskCandidate> = [
    ...records
      .filter((r) => r.repos.some((repo) => repos.has(repo)))
      .map((r) => ({
        label: r.final,
        names: [...new Set([r.final, r.suggested])],
        score: Math.max(textSimilarity(task.content, r.suggested), textSimilarity(task.content, r.final)),
      })),
    ...formTasks.map((t) => ({
      label: t.content.trim(),
      names: [t.content.trim()],
      score: textSimilarity(task.content, t.content),
    })),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((c) => c.score >= COMMIT_IMPORT_SIMILAR_TASK_AI_MIN && c.score < COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .filter((c) => !seen.has(c.label) && seen.add(c.label))
    .slice(0, COMMIT_IMPORT_SIMILAR_TASK_AI_CANDIDATE_LIMIT);
};
