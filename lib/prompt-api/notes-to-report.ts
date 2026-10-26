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

const buildPrompt = (notes: string, projectNames: ReadonlyArray<string>) => `## Existing projects in the report
${projectNames.length > 0 ? projectNames.map((n) => `- ${n}`).join('\n') : '(none)'}

## Notes
${notes}

## Task
Organize the notes into today (work done today, 금일) and tomorrow (work planned for tomorrow, 익일).
- Group tasks by project. If a task belongs to an existing project, use that exact name. Otherwise use a short project name taken from the notes, or "기타" if none fits.
- One task per line of work, written as a short Korean phrase (e.g. "로그인 오류 수정"). Do not copy whole sentences.
- Do not put progress or schedule words in the task text (완료, 절반, 진행 중, 예정, 내일) — progress is a separate number.
- progress: use an explicit percentage if written. Done (완료, 했다, 끝냄) = 100. In progress (진행 중, 하는 중, 절반) = 50 unless a number is given. Today's tasks with no hint = 100.
- Plans (내일, 할 예정, 예정) go to tomorrow with progress 0 unless a number is given.
- Leave a section as an empty array if the notes have nothing for it.`;

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
              .map((t) => ({ content: t.content.trim(), progress: Math.min(100, Math.max(0, Math.round(t.progress))) }))
              .filter((t) => t.content !== ''),
          }))
          .filter((p) => p.tasks.length > 0);
      return { today: clean(parsed.today ?? []), tomorrow: clean(parsed.tomorrow ?? []) };
    } finally {
      session.destroy();
    }
  });
}
