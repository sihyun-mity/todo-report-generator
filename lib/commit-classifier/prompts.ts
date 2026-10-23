import type { DetailEdit, ProgressEdit, Project, StyleSample } from '@/types';

// PoC(3개 데이터 세트, 47 커밋) 로 고른 프롬프트들.
// - 한 번에 여러 결정을 묻는 방식(단일 프롬프트, 선택형 enum)은 기존 항목으로 쏠려 "새 작업"을 거의 고르지 못했다.
// - 후보마다 0-10 점수를 매기게 하고 임계값으로 자르는 방식이 일치/불일치를 가장 안정적으로 갈랐다.
// - 예/아니오 질문은 "예"로 쏠렸고, 출력 구조가 복잡해질수록(커밋×후보 2중 배열) 정확도가 떨어졌다.

export type RepoCandidate = { id: string; name: string; tasks: ReadonlyArray<string> };

const scoreArray = (idKey: string, ids: ReadonlyArray<string>) => ({
  type: 'array',
  items: {
    type: 'object',
    properties: { [idKey]: { type: 'string', enum: ids }, score: { type: 'integer', minimum: 0, maximum: 10 } },
    required: [idKey, 'score'],
  },
});

export type RepoScoreResult = { repository: string; scores: Array<{ projectId: string; score: number }> };

// 후보 끝에 `none`(별도 코드베이스)을 함께 채점시킨다. 이 선택지가 없으면 인프라·파이프라인 저장소가
// 업무 도메인이 비슷한 프로젝트에 8점 이상을 받는 일이 있었다. 판정은 프로젝트 최고점만 보고 `none` 점수는 무시한다
// (`none` 이 실제 일치 프로젝트보다 높게 나온 경우가 있어 비교에 쓰면 오히려 틀렸다).
export const REPO_NONE_ID = 'none';

export const repoScorePrompt = (
  candidates: ReadonlyArray<RepoCandidate>,
  repo: string,
  messages: ReadonlyArray<string>
) => ({
  prompt: `Projects in a developer's daily work report (Korean names):
${candidates.map((c) => `- ${c.id}: ${c.name}${c.tasks.length ? ` (tasks: ${c.tasks.join(', ')})` : ''}`).join('\n')}
- ${REPO_NONE_ID}: none of these — this repository is a separate codebase (e.g. infra, CI, data pipeline, shared library, design system, or another app)

Repository: "${repo}"
Commits:
${messages.map((m) => `- ${m}`).join('\n')}

For each option, score 0-10 how likely this repository IS that project's own codebase.
10 = the repository name and commits clearly are that product.
5 = related business topic, but a different codebase.
0 = unrelated.`,
  schema: {
    type: 'object',
    properties: {
      repository: { type: 'string', maxLength: 100 },
      scores: scoreArray('projectId', [...candidates.map((c) => c.id), REPO_NONE_ID]),
    },
    required: ['repository', 'scores'],
  },
});

export type TaskScoreResult = { summary: string; scores: Array<{ taskId: string; score: number }> };

export const taskScorePrompt = (project: Project, messages: ReadonlyArray<string>) => {
  const tasks = project.tasks.filter((t) => t.content.trim());
  return {
    prompt: `Existing tasks (Korean):
${tasks.map((t) => `- ${t.id}: ${t.content.trim()}`).join('\n')}

Commits (Korean):
${messages.map((m) => `- ${m}`).join('\n')}

For each task, score 0-10 how likely these commits are work on that exact task. 10 = same feature/bug explicitly. 5 = same general area but different feature. 0 = unrelated.`,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', maxLength: 240 },
        scores: scoreArray(
          'taskId',
          tasks.map((t) => t.id)
        ),
      },
      required: ['summary', 'scores'],
    },
  };
};

export type NewTaskNamingResult = { items: Array<{ titleKo: string; groups: Array<number> }> };

// 새 작업 그룹을 같은 작업끼리 합치고 한국어 작업명을 붙인다. 이전 기록의 작업명을 예시로 줘 문체를 맞춘다.
export const newTaskNamingPrompt = (
  projectName: string,
  groups: ReadonlyArray<ReadonlyArray<string>>,
  styleSamples: ReadonlyArray<StyleSample>
) => {
  // "같은 작업이면 과거 작업명을 그대로 재사용"하라고 하면 예시 문구로 커밋과 무관한 작업을 지어내는 일이 있었다.
  // 예시는 문체(길이·어휘·종결 표현) 참고용으로만 쓰게 한다.
  const style = styleSamples.length
    ? `\n\nWriting style: this user's past task titles are below. Imitate ONLY their wording style (length, word choice, sentence ending such as "~ 개발", "~ 진행", "~ 대응"). Never copy their content and never create items for them — titles must describe the commits above.\n${styleSamples.map((s) => `- ${s.taskContent}`).join('\n')}`
    : '';
  return {
    prompt: `Project: "${projectName}". These commit groups are new work items (commit messages may be Korean or English):
${groups.map((g, n) => `${n}. ${g.join(' / ')}`).join('\n')}

Merge groups that are clearly the same work item (same feature or same bug). Keep different features separate. Every group number must appear in exactly one item. For each resulting work item, write a short task title IN KOREAN (a noun phrase, at most 25 characters), and list its group numbers.${style}`,
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titleKo: { type: 'string', maxLength: 40 },
              groups: { type: 'array', items: { type: 'integer' } },
            },
            required: ['titleKo', 'groups'],
          },
        },
      },
      required: ['items'],
    },
  };
};

export type DetailStyleResult = { lines: Array<string> };

// 세부 항목 문구를 사용자가 전에 고친 방식대로 다시 쓴다. 예시는 (커밋 제목 → 사용자가 고친 문구) 쌍이다.
export const detailStylePrompt = (edits: ReadonlyArray<DetailEdit>, lines: ReadonlyArray<string>) => ({
  prompt: `The user edits auto-generated work report lines (from git commit titles) into their own wording. Examples of the user's edits (before → after):
${edits.map((e) => `- "${e.original}" → "${e.edited}"`).join('\n')}

Rewrite each line below the same way the user would. Keep the meaning and language of the user's edits; do not add facts. Return exactly one line per input, in order.
${lines.map((line) => `- ${line}`).join('\n')}`,
  schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        minItems: lines.length,
        maxItems: lines.length,
        items: { type: 'string', maxLength: 80 },
      },
    },
    required: ['lines'],
  },
});

export type DetailSuggestionResult = { reason: string; details: Array<string> };

// 작업 아래 세부 항목이 필요한지 판단하고, 필요할 때만 커밋에 적힌 내용으로 짧게 쓴다.
// PoC: 작업명과 같은 뜻의 단일 커밋·같은 화면을 다듬은 커밋들은 비워 두고, 서로 다른 일을 한 커밋들만 나눠 적었다.
// 개수 상한을 커밋 수로 두지 않으면 커밋 하나에서 세부 항목 4줄을 지어냈다.
export const detailSuggestionPrompt = (task: string, messages: ReadonlyArray<string>, sparse: boolean) => {
  const max = Math.min(messages.length, 4);
  return {
    prompt: `A daily work report has a task line and optional sub-item lines under it (Korean).
Task: "${task}"
Git commits behind this task:
${messages.map((m) => `- ${m}`).join('\n')}

Decide whether sub-items are needed. Sub-items are needed only when the commits contain distinct pieces of work or specifics that the task line does not already say. If the task line already says what was done, return no sub-items.${sparse ? ' This user rarely writes sub-items, so add them only when clearly useful.' : ''}
When needed, write short Korean sub-items (noun phrases), at most one per commit (${max} max), merging commits about the same thing. Every sub-item must restate something written in a commit — never invent work that is not in the commits, and do not repeat the task line.`,
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', maxLength: 160 },
        details: { type: 'array', maxItems: max, items: { type: 'string', maxLength: 60 } },
      },
      required: ['reason', 'details'],
    },
  };
};

export type ProgressCandidate = { id: string; title: string; messages: ReadonlyArray<string> };
export type ProgressResult = { items: Array<{ taskId: string; progress: number }> };

// 진행률 예시·후보에 넣는 커밋 제목 수 — 커밋이 많은 작업도 프롬프트가 길어지지 않게 자른다
const PROGRESS_MESSAGE_LIMIT = 6;
const joinMessages = (messages: ReadonlyArray<string>) => messages.slice(0, PROGRESS_MESSAGE_LIMIT).join(' / ');

// 새 작업마다 커밋 제목으로 진행률(0-100)을 가늠한다. 커밋 종류(feat/fix 등)나 개수로 판단하지 않고,
// 제목에 미완성 신호가 분명할 때만 낮춘다 — 애매하면 100. 사용자가 전에 고친 진행률을 예시로 넘겨 성향을 따르게 한다.
// 이름짓기 프롬프트(PoC 검증)에 진행률을 덧붙이지 않고 따로 묻는다 — 검증된 프롬프트·스키마를 건드리지 않기 위해서다.
export const progressPrompt = (
  projectName: string,
  tasks: ReadonlyArray<ProgressCandidate>,
  edits: ReadonlyArray<ProgressEdit>
) => {
  const examples = edits.length
    ? `\n\nThis user corrected earlier suggestions as below (task — commits: suggested → user's value). Follow the user's tendency for similar work:\n${edits.map((e) => `- "${e.task}" — ${joinMessages(e.commits)}: ${e.suggested} → ${e.edited}`).join('\n')}`
    : '';
  return {
    prompt: `A developer's daily work report lists tasks with a completion percentage (0-100). These new tasks of project "${projectName}" were made from today's git commits (Korean or English):
${tasks.map((t) => `- ${t.id}: "${t.title}" — commits: ${joinMessages(t.messages)}`).join('\n')}

For each task, estimate how complete it is after these commits.
Assume the work is finished (100) unless the commit messages clearly say it is not — e.g. WIP, in progress, partial, part 1, first pass, draft, skeleton, TODO, 진행 중, 작업 중, 일부, 1차, 초안. When unsure, answer 100. Do not lower it because of the commit type (feat, fix, refactor, ...) or the number of commits.${examples}`,
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: tasks.length,
          maxItems: tasks.length,
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'string', enum: tasks.map((t) => t.id) },
              progress: { type: 'integer', minimum: 0, maximum: 100 },
            },
            required: ['taskId', 'progress'],
          },
        },
      },
      required: ['items'],
    },
  };
};
