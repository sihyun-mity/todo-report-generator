import type { AgentNotesDraft } from '@/types';
import { AGENT_CHAT_PROMPT_TIMEOUT_MS, AGENT_NOTES_MAX_CHARS } from '@/constants';
import { PROMPT_API_OPTIONS, withModelLock } from '.';

// 자유롭게 적은 업무 메모를 보고서 구조(금일·익일 → 프로젝트 → 작업·진행률)로 정리한다 — "메모로 보고서 쓰기".
// 채팅 루프와 달리 한 번의 구조화 출력이면 된다. 지시문은 영어, 메모와 결과 문구는 한국어(사용자 표현 그대로).
// 기존 프로젝트명을 후보로 넘겨 같은 프로젝트의 일은 그 이름으로 묶게 한다(새 이름을 지어내 프로젝트가 갈라지지 않게).

const SYSTEM_PROMPT = `You turn a developer's free-form Korean work notes into a structured daily work report.
Write project names and task lines in Korean, keeping the user's wording. Never invent work that is not in the notes.`;

const taskSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      progress: { type: 'integer', minimum: 0, maximum: 100 },
    },
    required: ['content', 'progress'],
    additionalProperties: false,
  },
};

const sectionSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { name: { type: 'string' }, tasks: { ...taskSchema, minItems: 1 } },
    required: ['name', 'tasks'],
    additionalProperties: false,
  },
};

const SCHEMA = {
  type: 'object',
  properties: { today: sectionSchema, tomorrow: sectionSchema },
  required: ['today', 'tomorrow'],
  additionalProperties: false,
};

// 메모를 오늘 한 일 / 내일 할 일로 먼저 나눈다(규칙) — 한 덩어리로 넘기면 "오늘은 A 고치고 B 절반 했어. 내일은 QA 예정"에서
// 오늘 한 B 를 익일로 보내고 내일 할 QA 를 빠뜨렸다. 문장(마침표·줄바꿈)으로 자르고, 문장 안에서 "내일·익일"이 나오면 그 앞에서 한 번 더 자른다
const PLAN_WORDS = /내일|익일|예정|할\s*(거|것|계획)|하려고/;
const splitNotes = (notes: string) => {
  const clauses = notes
    .split(/[.!?。\n]+/)
    .flatMap((sentence) => sentence.split(/(?=(?:내일|익일)(?:은|에는|엔|에)?\s)/))
    .map((clause) => clause.trim().replace(/[,\s]+$/, ''))
    .filter((clause) => clause !== '');
  return {
    today: clauses.filter((clause) => !PLAN_WORDS.test(clause)),
    tomorrow: clauses.filter((clause) => PLAN_WORDS.test(clause)),
  };
};

const buildPrompt = (notes: string, projectNames: ReadonlyArray<string>) => {
  const split = splitNotes(notes);
  // 둘로 갈리면 구역별로 넘긴다. 갈리지 않으면(전부 오늘 한 일 등) 예전처럼 한 덩어리로 넘긴다
  const notesBlock =
    split.today.length > 0 && split.tomorrow.length > 0
      ? `## Notes about today (work done today → today)\n${split.today.map((c) => `- ${c}`).join('\n')}\n\n## Notes about tomorrow (plans → tomorrow)\n${split.tomorrow.map((c) => `- ${c}`).join('\n')}\n\nUse each block only for its own section. Every line must become at least one task.`
      : `## Notes\n${notes}`;
  return `## Existing projects in the report
${projectNames.length > 0 ? projectNames.map((n) => `- ${n}`).join('\n') : '(none)'}

${notesBlock}

## Task
Organize the notes into today (work done today, 금일) and tomorrow (work planned for tomorrow, 익일).
- Group tasks by project. If a task belongs to an existing project, use that exact name. Otherwise use a short project name taken from the notes, or "기타" if none fits.
- One task per line of work, written as a short Korean phrase (e.g. "로그인 오류 수정"). Do not copy whole sentences.
- Do not put progress or schedule words in the task text (완료, 절반, 진행 중, 예정, 내일) — progress is a separate number.
- progress: use an explicit percentage if written. Done (완료, 했다, 끝냄) = 100. In progress (진행 중, 하는 중, 절반) = 50 unless a number is given. Today's tasks with no hint = 100.
- Plans (내일, 할 예정, 예정) go to tomorrow with progress 0 unless a number is given.
- Leave a section as an empty array if the notes have nothing for it.`;
};

// 작업이 어느 메모 문장에서 왔는지 낱말로 가늠해, 다른 구역 문장에서 왔으면 그 구역으로 옮긴다 —
// 오늘 "절반 했어"라고 한 일을 익일에 넣었다. 옮긴 작업의 진행률은 그 구역 기본값(익일 0)에 맞추지 않고 그대로 둔다
const words = (text: string) => text.split(/[^0-9A-Za-z가-힣]+/).filter((w) => w.length >= 2);
const overlap = (a: string, b: string) => {
  const target = new Set(words(b).map((w) => w.slice(0, 2)));
  return words(a).filter((w) => target.has(w.slice(0, 2))).length;
};
const moveToOwnSection = (draft: AgentNotesDraft, split: ReturnType<typeof splitNotes>): AgentNotesDraft => {
  if (split.today.length === 0 || split.tomorrow.length === 0) return draft;
  type Task = AgentNotesDraft['today'][number]['tasks'][number];
  const next: Record<'today' | 'tomorrow', Map<string, Array<Task>>> = { today: new Map(), tomorrow: new Map() };
  for (const section of ['today', 'tomorrow'] as const) {
    const other = section === 'today' ? 'tomorrow' : 'today';
    for (const project of draft[section]) {
      for (const task of project.tasks) {
        const own = Math.max(0, ...split[section].map((c) => overlap(task.content, c)));
        const elsewhere = Math.max(0, ...split[other].map((c) => overlap(task.content, c)));
        const bucket = next[elsewhere > own ? other : section];
        bucket.set(project.name, [...(bucket.get(project.name) ?? []), task]);
      }
    }
  }
  const toProjects = (bucket: Map<string, Array<Task>>) => [...bucket].map(([name, tasks]) => ({ name, tasks }));
  return { today: toProjects(next.today), tomorrow: toProjects(next.tomorrow) };
};

// 모델이 한쪽 메모를 통째로 빠뜨렸으면 그 문장으로 작업을 채운다 — 메모에 쓴 일이 초안에서 조용히 사라지지 않게.
// 일정·진행 말(내일은·예정·했어 등)은 떼고, 진행률은 오늘 한 일 100(절반이면 50) / 내일 할 일 0 으로 둔다
const CLAUSE_NOISE =
  /^(오늘은|오늘|금일은|금일|내일은|내일|익일은|익일|그리고)\s*|\s*(예정이야|예정|할\s*(거|것|계획)(이야|임)?|했어|했음|했다|함|하려고)\s*$/g;
const fallbackTasks = (clauses: ReadonlyArray<string>, section: 'today' | 'tomorrow') =>
  clauses
    .map((clause) => clause.replace(CLAUSE_NOISE, '').replace(CLAUSE_NOISE, '').trim())
    .filter((content) => content !== '')
    .map((content) => ({
      content: content.replace(/\s*(절반|반쯤)\s*$/, '').trim() || content,
      progress: section === 'tomorrow' ? 0 : /절반|반쯤/.test(content) ? 50 : 100,
    }));

// 작업 문구 끝의 일정·진행 말은 뗀다 — 진행률은 따로 적는데 모델이 "QA 회귀 테스트 예정", "결제 리팩터링 절반 완료"로 남겼다
const withoutProgressWords = (content: string) =>
  content
    .trim()
    .replace(/\s*(예정|절반\s*완료|절반|완료|진행\s*중|하는\s*중)$/, '')
    .trim() || content.trim();

export async function structureNotes(
  notes: string,
  projectNames: ReadonlyArray<string>,
  signal: AbortSignal
): Promise<AgentNotesDraft> {
  const input = notes.trim().slice(0, AGENT_NOTES_MAX_CHARS);
  return withModelLock(async () => {
    signal.throwIfAborted();
    const session = await LanguageModel.create({
      ...PROMPT_API_OPTIONS,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
      signal,
    });
    try {
      const raw = await session.prompt(buildPrompt(input, projectNames), {
        responseConstraint: SCHEMA,
        signal: AbortSignal.any([AbortSignal.timeout(AGENT_CHAT_PROMPT_TIMEOUT_MS), signal]),
      });
      const parsed = JSON.parse(raw) as AgentNotesDraft;
      // 빈 이름·빈 작업은 버린다 — 폼 반영(fill_report)이 비어 있는 항목을 거부한다
      const clean = (section: AgentNotesDraft['today']) =>
        section
          .map((p) => ({
            name: p.name.trim() || '기타',
            tasks: p.tasks
              .map((t) => ({
                content: withoutProgressWords(t.content),
                progress: Math.min(100, Math.max(0, Math.round(t.progress))),
              }))
              .filter((t) => t.content !== ''),
          }))
          .filter((p) => p.tasks.length > 0);
      const split = splitNotes(input);
      const draft = moveToOwnSection(
        { today: clean(parsed.today ?? []), tomorrow: clean(parsed.tomorrow ?? []) },
        split
      );
      for (const section of ['today', 'tomorrow'] as const) {
        if (draft[section].length > 0 || split[section].length === 0) continue;
        const tasks = fallbackTasks(split[section], section);
        if (tasks.length > 0) draft[section] = [{ name: '기타', tasks }];
      }
      return draft;
    } finally {
      session.destroy();
    }
  }, 'notes');
}

// 부탁 표현 — 이런 말이 있으면 메모가 아니라 부탁으로 본다("~해줘", "~알려", 물음표 등). "했어"·"함" 같은 서술은 걸리지 않는다.
const REQUEST_PATTERN = /(줘|주세요|주라|해라|할래|할까|하자|알려|보여|열어|가자|어때|뭐야|뭐지|\?)/;

// 입력창 하나로 부탁과 업무 메모를 함께 받는다. 분명한 메모(여러 줄이거나 길고, 부탁 표현이 없는 글)는 모델의 의도 분류를
// 거치지 않고 바로 메모 정리로 보낸다 — 호출을 아끼고, 모델이 메모를 "작업 추가" 부탁으로 잘못 고르는 일을 줄인다.
// 애매한 글은 채팅의 의도 분류(work_notes)가 가른다. 잘못 메모로 보내도 초안 카드만 뜨고 폼은 바뀌지 않는다.
export const hasRequestExpression = (text: string) => REQUEST_PATTERN.test(text.trim());

export const looksLikeWorkNotes = (text: string) => {
  const value = text.trim();
  if (hasRequestExpression(value)) return false;
  const lines = value.split('\n').filter((line) => line.trim() !== '').length;
  return lines >= 2 || value.length >= 25;
};
