import type { ReportFormStore } from '@/types';

// 화면에서 할 수 있는 일 → 에이전트(Nano·WebMCP)에서 그 일을 맡는 도구, 또는 노출하지 않는 이유.
// 사고가 날 때마다 도구를 하나씩 덧붙이다 보니 "화면에서는 되는데 Nano는 못 하는 일"이 계속 생겼다(진행률만 바꾸기·작업
// 하나 지우기가 없어 비슷한 도구로 대신하다 폼을 초기화했다). 기능을 추가하면 여기를 먼저 채운다.

type CoverageEntry = { tools: ReadonlyArray<string> } | { excluded: string };

// store 의 함수 키만 — 상태 값(reportDate 등)은 뺀다
type ReportFormActionName = {
  [K in keyof ReportFormStore]: ReportFormStore[K] extends (...args: never) => unknown ? K : never;
}[keyof ReportFormStore];

// 폼 store 의 모든 동작. 새 동작을 store 에 추가하면 여기를 채우기 전까지 타입 검사가 실패한다.
// (도구 이름이 실제로 등록됐는지는 개발 모드에서 useReportAgentTools 가 확인한다)
export const REPORT_FORM_ACTION_TOOLS = {
  setReportDate: { tools: ['set_report_date'] },
  setBucket: { tools: ['replace_report_section', 'fill_report'] },
  addProject: { tools: ['add_report_tasks'] },
  removeProject: { tools: ['remove_report_project'] },
  updateProjectName: { tools: ['rename_report_project'] },
  addTask: { tools: ['add_report_tasks'] },
  removeTask: { tools: ['remove_report_task', 'remove_duplicate_tasks'] },
  updateTask: { tools: ['set_task_progress', 'rename_report_task'] },
  addDetail: { tools: ['add_task_details'] },
  removeDetail: { tools: ['remove_task_detail'] },
  updateDetail: { tools: ['edit_task_detail'] },
  reorderDetails: {
    excluded:
      '세부 항목 순서는 드래그로만 바꾼다 — 요청이 드물고, 작업과 세부 항목을 두 겹으로 가리켜야 해 작은 모델이 자주 틀린다',
  },
  moveDetailToTask: { tools: ['move_task_detail'] },
  reorderProjects: { tools: ['move_report_project'] },
  moveProjectToBucket: { tools: ['move_report_project'] },
  reorderTasks: { tools: ['move_report_task'] },
  moveTaskToProject: { tools: ['move_report_task'] },
  initGoals: { excluded: '기록을 복원할 때 앱이 오늘의 목표를 정하는 내부 동작' },
  setGoals: { tools: ['dismiss_today_goals'] },
  placeGoals: { tools: ['place_today_goals'] },
  dismissGoals: { tools: ['dismiss_today_goals'] },
  markHydratedFromHistory: { excluded: '화면 내부 상태(기록 복원 여부) — 사용자 기능이 아니다' },
  resetForm: { tools: ['reset_report_form'] },
  resetSession: { excluded: '로그인 사용자 전환 때 앱이 부르는 내부 동작' },
} as const satisfies Record<ReportFormActionName, CoverageEntry>;

// store 밖의 화면 기능(보고서 작성 화면의 버튼·창). 타입으로 강제할 수 없어 화면에 기능을 추가하면 손으로 넣는다.
export const REPORT_SCREEN_FEATURE_TOOLS = {
  복사하기: { tools: ['copy_report'] },
  기록_저장: { tools: ['save_report'] },
  기록_내보내기: { tools: ['export_reports'] },
  기록_불러오기: { tools: ['load_report'] },
  기록_조회_검색: { tools: ['get_report', 'search_reports', 'list_report_dates'] },
  미완료_업무_가져오기: { tools: ['carry_over_incomplete_tasks', 'copy_today_to_tomorrow'] },
  텍스트로_복원: { tools: ['import_report_text', 'open_text_import'] },
  GitHub에서_가져오기: { tools: ['open_github_import'] },
  오늘의_목표_보기: { tools: ['list_today_goals'] },
  오늘의_목표_배치: { tools: ['place_today_goals'] },
  오늘의_목표_넘기기: { tools: ['dismiss_today_goals'] },
  작성_내용_초기화: { tools: ['reset_report_form'] },
  기록_삭제: { excluded: '저장된 기록을 지우는 일은 되돌리기 어려워 에이전트에 맡기지 않는다(기록 카드의 삭제 버튼)' },
  로컬_기록_이전: { excluded: '로그인 직후 한 번 묻는 계정 이전 — 사용자가 직접 고른다' },
  캘린더_월_이동: { excluded: '보기만 바꾸는 화면 조작 — 기록 내용은 조회 도구로 읽는다' },
  미리보기_크게_보기: { excluded: '보기만 바꾸는 화면 조작' },
} as const satisfies Record<string, CoverageEntry>;

// Nano 패널의 버튼·카드로 하는 일. 말로 부탁해도 같은 일을 하도록 채팅 도구를 둔다(use-chat-agent-tools.ts) —
// 되돌리기 도구가 없던 때 "되돌려줘"에 중복 작업 정리를 골라 "바뀐 것은 없어요"로 끝났다. 패널에 버튼을 더하면 손으로 넣는다.
export const AGENT_CHAT_FEATURE_TOOLS = {
  변경_되돌리기: { tools: ['undo_change'] },
  초안_추가: { tools: ['add_notes_draft'] },
  초안_취소: { tools: ['discard_notes_draft'] },
  새_대화: { tools: ['start_new_chat'] },
  패널_닫기: { tools: ['close_nano'] },
  답변_뒤_버튼: { excluded: '버튼마다 이미 도구를 가리킨다 — 받아들이는 말("응")은 첫 버튼을 실행한다' },
  빠른_작업_칩: { excluded: '칩마다 이미 도구나 요청을 가리킨다' },
  확인_카드_승인_거절: {
    excluded: '처리 중인 요청이 승인을 기다리는 동안이라 새 요청을 받지 않는다 — 카드에서 누른다',
  },
  멈추기: { excluded: '처리 중에는 새 요청을 받지 않는다 — 멈추기 버튼·Esc 로 한다' },
  추천_넘기기: { excluded: '이번 세션에서 다시 권하지 않게 하는 화면 조작일 뿐 — 데이터가 바뀌지 않는다' },
  음성_입력: { excluded: '마이크 권한 프롬프트(사용자 제스처)가 필요하다' },
  AI_모델_받기: { excluded: '다운로드는 사용자 클릭으로만 시작한다(Prompt API 규칙)' },
} as const satisfies Record<string, CoverageEntry>;
