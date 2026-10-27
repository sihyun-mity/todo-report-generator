import type { AgentChange, AgentChatTurn, AgentRequestScope, AgentTool, Project } from '@/types';
import { AGENT_CHAT_TOOL_WAIT_MS } from '@/constants';
import { useAgentChatStore, useAgentUndoStore, useReportFormStore, useReportHistoryStore } from '@/stores';
import { createEmptyProject, createId } from '@/utils';
import { runAgentChatTurn, setPlanCatalogMode } from '.';

// Nano 회귀 시나리오 — 프롬프트·도구 설명·kind 를 바꾸면 실제 모델(Chrome, available)로 다시 돌린다.
// 개발 모드에서 `await window.__nanoEval({ runs: 3 })` (콘솔 또는 chrome-devtools-mcp 의 evaluate_script).
// 확인 카드는 모두 승인한 것으로 보고, 시나리오가 끝나면 바꾼 것을 되돌리고 폼을 원래대로 둔다.
// 결과가 실행마다 흔들리므로 여러 번 돌려 통과 비율을 본다.

type EvalTask = { content: string; progress: number; details?: ReadonlyArray<string> };
type EvalProject = { name: string; tasks: ReadonlyArray<EvalTask> };
type EvalForm = {
  today: ReadonlyArray<EvalProject>;
  tomorrow: ReadonlyArray<EvalProject>;
  // 오늘의 목표 — 없으면 비운다
  goals?: ReadonlyArray<EvalProject>;
};

type EvalTurn = {
  say: string;
  // 이 중 하나 이상을 실행해야 하고, 쓰기 도구는 이 밖의 것을 실행하면 안 된다(빈 배열 = 아무 쓰기 도구도 실행하지 않음)
  expect?: ReadonlyArray<string>;
  // 실행하면 실패
  forbid?: ReadonlyArray<string>;
  // 답변이 이 패턴에 맞아야 한다 — 지금 상황(회원 여부·화면 등)을 알고 답하는지 본다
  // 함수면 실행할 때 정한다(로그인 여부처럼 돌리는 환경에 따라 맞는 답이 다를 때)
  answer?: RegExp | (() => RegExp);
  // 답변에 이 패턴이 있으면 실패 — 정해진 거절 문구로 끝나지 않고 스스로 답하는지 본다
  answerNot?: RegExp;
};

export type AgentEvalScenario = {
  name: string;
  form?: EvalForm;
  turns: ReadonlyArray<EvalTurn>;
  // 마지막 폼을 검사한다 — 문제가 있으면 이유를 돌려준다
  check?: (form: EvalForm) => string | null;
};

const MONITOR = '서비스 트래픽, 방화벽 모니터링(24시간)';
const TOKEN = '토큰 로그인 안정성 검증';
const GOAL_A = '주문서 상세 주소 저장 누락 오류 수정';
const GOAL_B = '포장 주문 배달비 포함 오류 수정';

const BASE_FORM: EvalForm = {
  today: [
    {
      name: '먹깨비 React 개발',
      tasks: [
        { content: MONITOR, progress: 100 },
        { content: TOKEN, progress: 30, details: ['구앱 토큰 만료 확인'] },
      ],
    },
  ],
  tomorrow: [],
};

// 정해진 거절 문구(UNSUPPORTED_ANSWER·CANNOT_ANSWER)
const FIXED_REFUSAL = /아직 Nano가 할 수 없는 일이에요|그대로 처리할 기능이 없어/;

const tasksOf = (projects: ReadonlyArray<EvalProject>) => projects.flatMap((p) => p.tasks.map((t) => t.content));
const has = (projects: ReadonlyArray<EvalProject>, content: string) => tasksOf(projects).includes(content);

export const AGENT_EVAL_SCENARIOS: ReadonlyArray<AgentEvalScenario> = [
  { name: '인사', turns: [{ say: '안녕! 뭐 할 수 있어?', expect: [] }] },
  {
    // 실제로 실패했던 대화 — 되돌리는 도구가 없어 "되돌려줘"에 중복 작업 정리를 골라 "바뀐 것은 없어요"로 끝났다
    name: '오늘의 목표 옮기기 → 되돌리기',
    form: {
      ...BASE_FORM,
      goals: [
        {
          name: '먹깨비 React 개발',
          tasks: [
            { content: GOAL_A, progress: 0 },
            { content: GOAL_B, progress: 0 },
          ],
        },
      ],
    },
    turns: [
      { say: '오늘의 목표 모두 금일 업무로 옮겨줘', expect: ['place_today_goals'] },
      { say: '되돌려줘', expect: ['undo_change'], forbid: ['remove_duplicate_tasks'], answer: /되돌렸/ },
    ],
    check: (form) =>
      has(form.today, GOAL_A) || has(form.today, GOAL_B)
        ? '목표가 금일 업무에 남아 있다'
        : !has(form.goals ?? [], GOAL_A)
          ? '목표 목록으로 돌아오지 않았다'
          : null,
  },
  {
    name: '진행률 바꾸기 → 원래대로',
    form: BASE_FORM,
    turns: [
      { say: '토큰 로그인 작업 진행률 80%로 바꿔줘', expect: ['set_task_progress'] },
      { say: '아까 바꾼 거 원래대로 돌려놔', expect: ['undo_change'] },
    ],
    check: (form) =>
      form.today.flatMap((p) => p.tasks).find((t) => t.content === TOKEN)?.progress === 30
        ? null
        : '진행률이 30% 로 돌아오지 않았다',
  },
  {
    // 바꾼 게 없으면 다른 도구로 대신하지 않고 그렇다고 알린다
    name: '되돌릴 것 없음',
    form: BASE_FORM,
    turns: [{ say: '되돌려줘', expect: [], answer: /되돌릴/ }],
  },
  {
    // 앞의 변경은 뒤의 변경이 있으면 따로 되돌릴 수 없다 — 그렇다고 알리고 함께 되돌릴지 묻는다. 받아들이면 둘 다 되돌린다
    // (따로 되돌릴 수 있는 것처럼 보여 주던 때는 고르고 실패했다)
    name: '여러 변경 중 앞의 것 되돌리기',
    form: BASE_FORM,
    turns: [
      { say: '토큰 로그인 작업은 내일로 옮겨줘', expect: ['move_report_task'] },
      { say: '서비스 트래픽 모니터링 작업 진행률 50%로 바꿔줘', expect: ['set_task_progress'] },
      { say: '아까 내일로 옮긴 거 원래대로 돌려놔', expect: ['undo_change'], answer: /함께 되돌릴까요/ },
      { say: '응, 같이 되돌려줘', expect: ['undo_change'], answer: /되돌렸/ },
    ],
    check: (form) =>
      !has(form.today, TOKEN)
        ? '토큰 작업이 금일로 돌아오지 않았다'
        : form.today.flatMap((p) => p.tasks).find((t) => t.content === MONITOR)?.progress !== 100
          ? '진행률 변경이 함께 되돌아가지 않았다'
          : null,
  },
  // 패널 버튼으로만 하던 일 — 말로 해도 같은 도구가 맡는다(AGENT_CHAT_FEATURE_TOOLS)
  { name: '새 대화', turns: [{ say: '새 대화 시작해줘', expect: ['start_new_chat'] }] },
  { name: 'Nano 닫기', turns: [{ say: '나노 패널 닫아줘', expect: ['close_nano'] }] },
  {
    // 실제로 실패했던 질문 — 쓰기 의도로 분류돼 "처리할 기능이 없어요"로 끝났다
    name: '작성 중 보고서 개수 묻기',
    form: { ...BASE_FORM, tomorrow: [{ name: 'QA', tasks: [{ content: '회귀 테스트', progress: 0 }] }] },
    turns: [{ say: '내일 할 업무는 몇가지야?', expect: ['get_current_report'] }],
  },
  {
    // 실제로 실패했던 대화 — 다듬는 질문을 "보고서에 추가"로 분류해 "처리할 기능이 없어요"로 끝났다
    name: '지난주 작업 수 → 작업 단위로 다시',
    turns: [
      { say: '지난주에 한 업무는 몇가지나 돼?', expect: ['search_reports'] },
      { say: '프로젝트 단위말고 작업 단위로 세줘', expect: [] },
    ],
  },
  {
    // 실제로 실패했던 대화 — 중복이 생기고, 중복 삭제가 폼 초기화로 갔다
    name: '반복 업무 복사 → 진행률 → 중복 정리',
    form: BASE_FORM,
    turns: [
      {
        say: '토큰 로그인 관련 작업 삭제해줘. 오늘 안했어',
        expect: ['remove_report_task'],
        forbid: ['reset_report_form'],
      },
      // 덧붙이기로 같은 작업을 넣어도 결과는 같다(같은 작업은 둘이 되지 않는다)
      {
        say: '오늘 한 작업은 매일 반복하는 작업이야. 내일 할 일에도 넣어줘.',
        expect: ['copy_today_to_tomorrow', 'add_report_tasks'],
      },
      { say: '진행률도 똑같이 해줘', expect: ['set_task_progress', 'copy_today_to_tomorrow', 'add_report_tasks'] },
      { say: '중복 작업 삭제해줘', forbid: ['reset_report_form'] },
    ],
    check: (form) => {
      if (has(form.today, TOKEN)) return '토큰 작업이 남아 있다';
      if (!has(form.today, MONITOR)) return '금일 모니터링 작업이 사라졌다';
      const tomorrow = form.tomorrow.flatMap((p) => p.tasks).filter((t) => t.content === MONITOR);
      if (tomorrow.length !== 1) return `익일 모니터링 작업이 ${tomorrow.length}개`;
      if (tomorrow[0].progress !== 100) return `익일 진행률 ${tomorrow[0].progress}%`;
      return null;
    },
  },
  {
    name: '작업 추가(금일)',
    form: BASE_FORM,
    turns: [{ say: '금일 업무에 "API 연동" 작업을 진행률 70%로 추가해줘', expect: ['add_report_tasks'] }],
    check: (form) =>
      form.today.flatMap((p) => p.tasks).some((t) => t.content.includes('API 연동') && t.progress === 70)
        ? null
        : 'API 연동 70% 가 없다',
  },
  {
    name: '작업 추가(익일)',
    form: BASE_FORM,
    turns: [{ say: '내일 할 일에 "QA" 프로젝트 "회귀 테스트" 넣어줘', expect: ['add_report_tasks'] }],
    check: (form) =>
      form.tomorrow.some((p) => p.name === 'QA' && p.tasks.some((t) => t.content.includes('회귀 테스트')))
        ? null
        : '익일 QA · 회귀 테스트가 없다',
  },
  {
    name: '진행률 바꾸기',
    form: BASE_FORM,
    turns: [{ say: '토큰 로그인 작업 진행률 80%로 바꿔줘', expect: ['set_task_progress'] }],
    check: (form) =>
      form.today.flatMap((p) => p.tasks).find((t) => t.content === TOKEN)?.progress === 80 ? null : '80% 가 아니다',
  },
  {
    name: '작업 익일로 옮기기',
    form: BASE_FORM,
    turns: [{ say: '토큰 로그인 작업은 내일로 옮겨줘', expect: ['move_report_task'] }],
    check: (form) => (has(form.tomorrow, TOKEN) && !has(form.today, TOKEN) ? null : '옮겨지지 않았다'),
  },
  {
    name: '프로젝트 이름 바꾸기',
    form: BASE_FORM,
    turns: [{ say: '먹깨비 React 개발 프로젝트 이름을 먹깨비 웹으로 바꿔줘', expect: ['rename_report_project'] }],
    check: (form) => (form.today.some((p) => p.name === '먹깨비 웹') ? null : '이름이 그대로다'),
  },
  {
    name: '세부 항목 추가',
    form: BASE_FORM,
    turns: [{ say: '토큰 로그인 작업 아래에 "신앱 재현 테스트" 세부 항목 추가해줘', expect: ['add_task_details'] }],
    check: (form) =>
      form.today
        .flatMap((p) => p.tasks)
        .find((t) => t.content === TOKEN)
        ?.details?.some((d) => d.includes('신앱 재현'))
        ? null
        : '세부 항목이 없다',
  },
  {
    name: '작업 내용 고치기',
    form: BASE_FORM,
    turns: [
      { say: '토큰 로그인 안정성 검증 작업을 "토큰 로그인 재현 테스트"로 고쳐줘', expect: ['rename_report_task'] },
    ],
    check: (form) =>
      has(form.today, '토큰 로그인 재현 테스트') && !has(form.today, TOKEN) ? null : '작업 내용이 그대로다',
  },
  {
    name: '세부 항목 고치기·삭제',
    form: BASE_FORM,
    turns: [
      { say: '"구앱 토큰 만료 확인" 세부 항목을 "구앱 토큰 만료 재현"으로 고쳐줘', expect: ['edit_task_detail'] },
      { say: '방금 고친 세부 항목 지워줘', expect: ['remove_task_detail'] },
    ],
    check: (form) =>
      form.today.flatMap((p) => p.tasks).find((t) => t.content === TOKEN)?.details?.length === 0
        ? has(form.today, TOKEN)
          ? null
          : '작업까지 지웠다'
        : '세부 항목이 남아 있다',
  },
  {
    name: '프로젝트 옮기기·삭제',
    form: {
      today: [...BASE_FORM.today, { name: '사내 위키', tasks: [{ content: '온보딩 문서 정리', progress: 40 }] }],
      tomorrow: [],
    },
    turns: [
      { say: '사내 위키 프로젝트는 통째로 내일로 옮겨줘', expect: ['move_report_project'] },
      { say: '먹깨비 React 개발 프로젝트는 삭제해줘', expect: ['remove_report_project'] },
    ],
    check: (form) =>
      form.tomorrow.some((p) => p.name === '사내 위키') && form.today.length === 0 ? null : '옮기거나 지우지 못했다',
  },
  {
    name: '중복 정리',
    form: {
      today: [],
      tomorrow: [
        {
          name: '먹깨비 React 개발',
          tasks: [
            { content: MONITOR, progress: 0 },
            { content: MONITOR, progress: 100 },
          ],
        },
      ],
    },
    turns: [
      {
        say: '중복 작업 삭제해줘. 지금 익일 업무에 두 개가 있잖아',
        expect: ['remove_duplicate_tasks'],
        forbid: ['reset_report_form'],
      },
    ],
    check: (form) => {
      const left = form.tomorrow.flatMap((p) => p.tasks).filter((t) => t.content === MONITOR);
      return left.length === 1 && left[0].progress === 100 ? null : `익일 모니터링 ${left.length}개`;
    },
  },
  {
    name: '업무 통째로 바꾸기',
    form: BASE_FORM,
    turns: [
      { say: '익일 업무를 "배포 준비" 작업 하나로 바꿔줘', expect: ['replace_report_section', 'add_report_tasks'] },
    ],
    check: (form) => (tasksOf(form.tomorrow).some((t) => t.includes('배포 준비')) ? null : '배포 준비가 없다'),
  },
  {
    name: '날짜 바꾸기',
    form: BASE_FORM,
    turns: [{ say: '보고서 날짜를 어제로 바꿔줘', expect: ['set_report_date'] }],
  },
  {
    name: '초기화(명시)',
    form: BASE_FORM,
    turns: [{ say: '작성 중인 거 전부 비워줘', expect: ['reset_report_form'] }],
    check: (form) => (tasksOf(form.today).length === 0 ? null : '비워지지 않았다'),
  },
  // 초기화 뒤의 다른 요청을 초기화로 분류해 처리하지 못했고, 그 요청이 다음 "어둡게 해줘"에서 대신 실행됐다
  {
    name: '초기화 뒤 다른 요청',
    form: BASE_FORM,
    turns: [
      { say: '작성 내용 초기화해줘', expect: ['reset_report_form'] },
      { say: '계정 설정 열어줘', expect: ['navigate'], forbid: ['reset_report_form'] },
      { say: '어둡게 해줘', expect: ['set_theme'], forbid: ['navigate'] },
    ],
  },
  {
    name: '할 수 없는 일',
    form: BASE_FORM,
    // 할 수 없는 일도 정해진 거절 문구 대신 이유와 대안을 스스로 말한다
    turns: [
      {
        say: '지난주 저장된 보고서 기록 삭제해줘',
        expect: [],
        forbid: ['reset_report_form'],
        answer: /기록|삭제|지우/,
        answerNot: FIXED_REFUSAL,
      },
    ],
    check: (form) => (has(form.today, MONITOR) ? null : '폼이 바뀌었다'),
  },
  // 여러 가지를 한 번에 부탁하면 계획을 세워(확인 카드) 차례로 한다 — 예전에는 앞의 하나만 했다
  {
    name: '여러 단계 한 번에',
    form: BASE_FORM,
    turns: [
      {
        say: '토큰 로그인 작업 진행률 80%로 바꾸고 내일로 옮겨줘',
        expect: ['set_task_progress', 'move_report_task'],
      },
    ],
    check: (form) => {
      const moved = form.tomorrow.flatMap((p) => p.tasks).find((t) => t.content === TOKEN);
      return moved?.progress === 80 ? null : `익일 토큰 로그인 ${moved ? `${moved.progress}%` : '없음'}`;
    },
  },
  // 여러 단계 — 계획(planSteps)이 도구를 고르는 정확도를 본다(계획용 도구 목록 짧게/전체 A/B)
  {
    name: '여러 단계: 추가하고 진행률',
    form: BASE_FORM,
    turns: [
      {
        say: '금일에 "API 연동" 작업을 50%로 추가하고 토큰 로그인 작업은 100%로 바꿔줘',
        expect: ['add_report_tasks', 'set_task_progress'],
      },
    ],
    check: (form) => {
      const tasks = form.today.flatMap((p) => p.tasks);
      const api = tasks.find((t) => t.content.includes('API 연동'));
      const token = tasks.find((t) => t.content === TOKEN);
      return api?.progress === 50 && token?.progress === 100
        ? null
        : `API 연동 ${api ? `${api.progress}%` : '없음'}, 토큰 로그인 ${token?.progress}%`;
    },
  },
  {
    name: '여러 단계: 지우고 추가',
    form: BASE_FORM,
    turns: [
      {
        say: '모니터링 작업은 지우고 익일에 "QA" 프로젝트 "회귀 테스트" 작업 추가해줘',
        expect: ['remove_report_task', 'add_report_tasks'],
      },
    ],
    check: (form) =>
      !has(form.today, MONITOR) && has(form.tomorrow, '회귀 테스트')
        ? null
        : `모니터링 ${has(form.today, MONITOR) ? '남음' : '지움'}, 회귀 테스트 ${has(form.tomorrow, '회귀 테스트') ? '있음' : '없음'}`,
  },
  {
    name: '여러 단계: 세부 항목 넣고 진행률',
    form: BASE_FORM,
    turns: [
      {
        say: '토큰 로그인 작업 아래에 "신앱 재현 테스트" 세부 항목 추가하고 진행률은 60%로 바꿔줘',
        expect: ['add_task_details', 'set_task_progress'],
      },
    ],
    check: (form) => {
      const token = form.today.flatMap((p) => p.tasks).find((t) => t.content === TOKEN);
      return token?.progress === 60 && token.details?.includes('신앱 재현 테스트')
        ? null
        : `토큰 로그인 ${token?.progress}%, 세부 항목 ${token?.details?.join(', ')}`;
    },
  },
  {
    name: '여러 단계: 이름 바꾸고 옮기기',
    form: BASE_FORM,
    turns: [
      {
        say: '토큰 로그인 안정성 검증 작업 이름을 "토큰 로그인 재현"으로 고치고 내일로 옮겨줘',
        expect: ['rename_report_task', 'move_report_task'],
      },
    ],
    check: (form) => (has(form.tomorrow, '토큰 로그인 재현') ? null : '익일에 토큰 로그인 재현이 없다'),
  },
  // 정정하면 그 말대로 다시 처리한다
  {
    name: '정정',
    turns: [
      { say: '다크 모드로 바꿔줘', expect: ['set_theme'] },
      { say: '아니 그게 아니라 라이트 모드로 해줘', expect: ['set_theme'] },
    ],
  },
  // 바꾸지 않는 부탁(문장 다듬기·조언)은 거절하지 않고 스스로 답한다
  {
    name: '문장 다듬기 제안',
    form: BASE_FORM,
    turns: [
      {
        say: '토큰 로그인 안정성 검증이라는 작업 이름, 보고서에 어울리게 다른 표현 추천해 줄래?',
        expect: [],
        answerNot: FIXED_REFUSAL,
      },
    ],
    check: (form) => (has(form.today, TOKEN) ? null : '폼이 바뀌었다'),
  },
  {
    name: '보고서 잘 쓰는 법',
    turns: [{ say: '일일 업무 보고 잘 쓰는 팁 알려줘', expect: [], answerNot: FIXED_REFUSAL }],
  },
  {
    name: '작성 중 보고서 요약',
    form: BASE_FORM,
    turns: [{ say: '지금 작성 중인 보고서 요약해줘', expect: ['get_current_report'] }],
  },
  // 대화로 분류돼도 기록을 묻는 말이면 조회해야 한다 — 도구 없이 답하면 기록을 지어낸다
  {
    name: '저장 횟수 묻기',
    turns: [{ say: '이번 달에 보고서 몇 번 썼어?', expect: ['list_report_dates', 'search_reports'] }],
  },
  { name: '이번 주 기록 정리', turns: [{ say: '이번 주에 쓴 보고서 정리해줘', expect: ['search_reports'] }] },
  { name: '화면 모드', turns: [{ say: '다크 모드로 바꿔줘', expect: ['set_theme'] }] },
  { name: '새소식', turns: [{ say: '최근 새소식 알려줘', expect: ['list_news'] }] },
  // 소식 하나를 순서로 집어 "보여줘"는 상세 화면으로 연다 — 화면 모드로 분류돼 목록을 읽고 "11가지가 있어요"라고 답했다
  {
    name: '새소식 열기',
    turns: [{ say: '가장 최근 새소식 보여줘', expect: ['open_news'], forbid: ['list_news', 'set_theme'] }],
  },
  { name: '새소식 순서로 열기', turns: [{ say: '두 번째 새소식 열어줘', expect: ['open_news'] }] },
  // 새소식을 알려 준 뒤 "그거 보여줘"는 그 소식을 연다 — 본문을 다시 읽어 늘어놓았다
  {
    name: '새소식 가리켜 열기',
    turns: [
      { say: '가장 최근 새소식 알고싶어', expect: ['list_news', 'get_news'] },
      { say: '그거 보여줘', expect: ['open_news'], forbid: ['get_news', 'list_news'] },
    ],
  },
  { name: '새소식 화면 이동', turns: [{ say: '새소식 화면으로 가줘', expect: ['navigate'] }] },
  // "자세히 보시겠어요?" 뒤의 "자세히 보여줘"는 그 소식을 연다 — GitHub 가져오기 창을 열었다
  {
    name: '새소식 자세히 보기',
    turns: [
      { say: '가장 최근 새소식 알려줘', expect: ['list_news', 'get_news'] },
      { say: '자세히 보여줘', expect: ['open_news'], forbid: ['open_github_import'] },
    ],
  },
  // GitHub 커밋을 가져와 달라는 말은 가져오기 창을 연다 — "가져와"로 추가 의도가 돼 "직접 실행할 수 없어요"로 끝났다
  { name: 'GitHub 가져오기', turns: [{ say: 'github에서 커밋 가져와줘', expect: ['open_github_import'] }] },
  { name: 'GitHub 가져오기 열기', turns: [{ say: '깃허브 가져오기 열어줘', expect: ['open_github_import'] }] },
  {
    name: '텍스트로 복원 창',
    turns: [{ say: '텍스트로 복원 창 열어줘', expect: ['open_text_import'], forbid: ['import_report_text'] }],
  },
  // 묻는 말은 화면을 옮기지 않고 답한다 — "알고싶어"에 새소식 화면으로 옮겨 갔다
  {
    name: '새소식 묻기',
    turns: [{ say: '가장 최근 소식 알고싶어', expect: ['list_news', 'get_news'], forbid: ['navigate', 'open_news'] }],
  },
  // "다시 시도해"는 앞 요청을 다시 처리한다 — 문장 그대로 후보를 걸러 "처리할 기능이 없어요"로 끝났다
  {
    name: '다시 시도',
    turns: [
      { say: '가장 최근 새소식 알려줘', expect: ['list_news', 'get_news'] },
      { say: '다시 시도해', expect: ['list_news', 'get_news'] },
    ],
  },
  // 앞 요청에서 다룬 작업을 "그거"로 가리킨다 — 새소식에만 있던 이어받기를 보고서 작업에도
  {
    name: '작업 가리켜 고치기',
    form: BASE_FORM,
    turns: [
      { say: '토큰 로그인 작업 진행률 몇이야?', expect: [] },
      { say: '그거 80%로 바꿔줘', expect: ['set_task_progress'] },
    ],
    check: (form) =>
      form.today.flatMap((p) => p.tasks).find((t) => t.content === TOKEN)?.progress === 80
        ? null
        : '토큰 로그인 진행률이 80 이 아니다',
  },
  // 대화 자체를 묻는 말은 대화에서 답한다(도구 결과에만 묶어 두었더니 엉뚱한 답을 했다)
  {
    name: '방금 한 일 묻기',
    form: BASE_FORM,
    turns: [
      { say: '토큰 로그인 작업 진행률 50%로 바꿔줘', expect: ['set_task_progress'] },
      { say: '방금 뭐 했어?', expect: [], answer: /토큰|진행률|50/ },
    ],
  },
  // 지금 상황(Situation now)으로 답해야 하는 질문 — 도구 없이도 회원 여부·화면을 안다
  {
    name: '로그인 상태',
    // 게스트에게 "로그인되어 계세요"라고 답한 적이 있다 — 지금 로그인 상태에 맞게 답했는지 본다
    turns: [
      {
        say: '나 지금 로그인 되어 있어?',
        expect: [],
        answer: () =>
          useReportHistoryStore.getState().mode === 'user'
            ? /^(?![\s\S]*(않|아니|안\s*돼))[\s\S]*(로그인\s*(되어|돼)\s*(있|계)|로그인\s*(되셨|됐|된\s*상태)|회원)/
            : /^\s*아니|게스트|비회원|로그인(되어|돼)\s*있지\s*않|로그인하지\s*않|로그인\s*안/,
      },
    ],
  },
  { name: '지금 화면', turns: [{ say: '지금 무슨 화면이야?', expect: [], answer: /보고|홈|작성/ }] },
  {
    name: '사용법(GitHub)',
    turns: [{ say: 'GitHub에서 가져오기는 어떻게 써?', expect: [], answer: /GitHub|커밋/ }],
  },
];

// 화면을 옮기는 시나리오(새소식 열기) 뒤에는 시작 화면으로 돌아와 그 화면의 도구가 다시 등록될 때까지 기다린다
const returnTo = async (path: string, getTools: () => ReadonlyArray<AgentTool>, toolNames: ReadonlyArray<string>) => {
  if (window.location.pathname === path) return;
  window.history.back();
  const startedAt = Date.now();
  while (
    (window.location.pathname !== path || !toolNames.every((name) => getTools().some((t) => t.name === name))) &&
    Date.now() - startedAt < AGENT_CHAT_TOOL_WAIT_MS
  )
    await new Promise((resolve) => setTimeout(resolve, 100));
};

const toProjects = (projects: ReadonlyArray<EvalProject>): Array<Project> =>
  projects.length === 0
    ? [createEmptyProject()]
    : projects.map((p) => ({
        id: createId(),
        name: p.name,
        tasks: p.tasks.map((t) => ({
          id: createId(),
          content: t.content,
          progress: t.progress,
          details: (t.details ?? []).map((content) => ({ id: createId(), content })),
        })),
      }));

const fromProjects = (projects: ReadonlyArray<Project>): Array<EvalProject> =>
  projects
    .filter((p) => p.name.trim() !== '' || p.tasks.some((t) => t.content.trim() !== ''))
    .map((p) => ({
      name: p.name,
      tasks: p.tasks.map((t) => ({
        content: t.content,
        progress: t.progress,
        details: t.details.map((d) => d.content),
      })),
    }));

// thinking — 끝난 생각 단계(고른 의도·할 일). 틀린 시나리오에서 어디서 갈라졌는지 본다
type TurnLog = { say: string; tools: Array<string>; answer: string; thinking: Array<string>; problem: string | null };
export type AgentEvalResult = {
  scenario: string;
  run: number;
  pass: boolean;
  problems: Array<string>;
  turns: Array<TurnLog>;
  // 시나리오 한 번에 걸린 시간 — 프롬프트를 바꿨을 때 빨라지거나 느려졌는지 본다
  ms: number;
};

export async function runAgentEval({
  getTools,
  getSituation,
  runs = 1,
  only,
  planCatalog = 'short',
}: Readonly<{
  getTools: () => ReadonlyArray<AgentTool>;
  getSituation?: (scope: AgentRequestScope) => Promise<Record<string, unknown>>;
  runs?: number;
  only?: ReadonlyArray<string>;
  // 여러 단계 계획에 넘기는 도구 목록 — 짧게(기본)·전체를 A/B 로 견줄 때 바꾼다
  planCatalog?: 'short' | 'full';
}>) {
  setPlanCatalogMode(planCatalog);
  const scenarios = AGENT_EVAL_SCENARIOS.filter((s) => !only || only.some((name) => s.name.includes(name)));
  // 보고서 작성 화면이면 폼이 기록을 불러와 준비될 때까지(보고서 도구가 등록될 때까지) 기다린다 — 새로고침 직후 바로 돌리면
  // 늦게 끝난 불러오기가 시나리오 폼을 덮어써 "지금 있는 프로젝트: (없음)"으로 실패했다
  if (window.location.pathname === '/') {
    const startedAt = Date.now();
    while (
      !getTools().some((t) => t.name === 'add_report_tasks') &&
      Date.now() - startedAt < AGENT_CHAT_TOOL_WAIT_MS * 2
    )
      await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const original = useReportFormStore.getState();
  const saved = {
    reportDate: original.reportDate,
    today: original.today,
    tomorrow: original.tomorrow,
    goals: original.goals,
  };
  const startPath = window.location.pathname;
  const startTools = getTools().map((t) => t.name);
  const results: Array<AgentEvalResult> = [];

  try {
    for (const scenario of scenarios) {
      for (let run = 1; run <= runs; run++) {
        const runStartedAt = performance.now();
        const store = useReportFormStore.getState();
        if (scenario.form) {
          store.setBucket('today', toProjects(scenario.form.today));
          store.setBucket('tomorrow', toProjects(scenario.form.tomorrow));
          store.setGoals(toProjects(scenario.form.goals ?? []));
        }
        // 시나리오마다 새 대화 — 앞 시나리오에서 다룬 대상("그거")이 넘어오지 않게
        useAgentChatStore.getState().clearFocus();
        // 되돌리기 도구(undo_change)가 이 시나리오에서 바꾼 것만 되돌리게 목록을 비운다
        useAgentUndoStore.getState().clear();
        const undos: Array<NonNullable<AgentChange['undo']>> = [];
        const history: Array<AgentChatTurn> = [];
        const logs: Array<TurnLog> = [];
        try {
          for (const turn of scenario.turns) {
            history.push({ role: 'user', text: turn.say });
            const tools: Array<string> = [];
            let currentTitle = '';
            const failed: Array<string> = [];
            let answer = '';
            const thinking = new Map<string, string>();
            const { turns } = await runAgentChatTurn({
              history,
              getTools,
              getSituation,
              onFocus: (patch) => useAgentChatStore.getState().updateFocus(patch),
              canWriteFromNotes: false,
              signal: new AbortController().signal,
              context: {
                confirm: async () => true,
                reportChange: (change) => {
                  if (!change.undo) return;
                  undos.push(change.undo);
                  useAgentUndoStore.getState().push({
                    id: createId(),
                    title: currentTitle,
                    lines: change.lines,
                    undo: change.undo,
                    canUndo: change.canUndo,
                  });
                },
              },
              onToolStart: (tool) => {
                tools.push(tool.name);
                currentTitle = tool.title;
              },
              // 실패한 시도(빈 구역에서 이름 바꾸기 등)는 쓰기로 세지 않는다 — 다른 도구로 다시 골라 해내면 통과다
              onToolEnd: (tool, result) => {
                if (result.isError) failed.push(tool.name);
              },
              onThinking: (step) => {
                // 도구 입력 요약(detail)도 남긴다 — 고른 도구는 맞는데 입력(대상 작업 등)이 틀린 경우를 가려낸다
                if (step.status === 'done')
                  thinking.set(step.key, step.detail ? `${step.label} [${step.detail}]` : step.label);
              },
              onAnswer: (text) => {
                answer = text;
              },
            });
            history.push(...turns);
            const all = getTools();
            const writes = tools.filter(
              (name) => all.find((t) => t.name === name)?.kind !== 'read' && !failed.includes(name)
            );
            let problem: string | null = null;
            const forbidden = tools.filter((name) => turn.forbid?.includes(name));
            if (forbidden.length > 0) problem = `금지 도구 실행: ${forbidden.join(', ')}`;
            else if (turn.expect && turn.expect.length === 0 && writes.length > 0)
              problem = `쓰기 도구를 실행하면 안 됨: ${writes.join(', ')}`;
            else if (turn.expect && turn.expect.length > 0) {
              if (!tools.some((name) => turn.expect!.includes(name)))
                problem = `기대 도구 없음 (${turn.expect.join('|')}), 실행: ${tools.join(', ') || '없음'}`;
              else if (writes.some((name) => !turn.expect!.includes(name)))
                problem = `다른 쓰기 도구 실행: ${writes.join(', ')}`;
            }
            const expected = typeof turn.answer === 'function' ? turn.answer() : turn.answer;
            if (!problem && expected && !expected.test(answer))
              problem = `답변이 ${expected} 에 맞지 않음: ${answer.slice(0, 80)}`;
            if (!problem && turn.answerNot?.test(answer))
              problem = `답변에 ${turn.answerNot} 가 있음: ${answer.slice(0, 80)}`;
            logs.push({ say: turn.say, tools, answer, thinking: [...thinking.values()], problem });
          }
          const state = useReportFormStore.getState();
          const formProblem =
            scenario.check?.({
              today: fromProjects(state.today),
              tomorrow: fromProjects(state.tomorrow),
              goals: fromProjects(state.goals),
            }) ?? null;
          const problems = [
            ...logs.flatMap((l) => (l.problem ? [l.problem] : [])),
            ...(formProblem ? [formProblem] : []),
          ];
          results.push({
            scenario: scenario.name,
            run,
            pass: problems.length === 0,
            problems,
            turns: logs,
            ms: Math.round(performance.now() - runStartedAt),
          });
        } catch (error) {
          results.push({
            scenario: scenario.name,
            run,
            pass: false,
            problems: [`오류: ${String(error)}`],
            turns: logs,
            ms: Math.round(performance.now() - runStartedAt),
          });
        } finally {
          // 화면 모드 등 폼 밖의 변경도 되돌린다(늦게 바뀐 것부터)
          for (const undo of undos.reverse()) undo();
          await returnTo(startPath, getTools, startTools);
        }
        console.info(
          `[nano-eval] ${scenario.name} #${run}: ${results.at(-1)!.pass ? '통과' : results.at(-1)!.problems.join(' / ')}`
        );
      }
    }
  } finally {
    const store = useReportFormStore.getState();
    store.setReportDate(saved.reportDate);
    store.setBucket('today', saved.today);
    store.setBucket('tomorrow', saved.tomorrow);
    store.setGoals(saved.goals);
    setPlanCatalogMode('short');
  }

  const summary = scenarios.map((s) => {
    const mine = results.filter((r) => r.scenario === s.name);
    return { scenario: s.name, passed: `${mine.filter((r) => r.pass).length}/${mine.length}` };
  });
  console.table(summary);
  return { summary, results };
}
