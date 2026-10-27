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
  작성_내용_초기화: { tools: ['reset_report_form'] },
  기록_삭제: { excluded: '저장된 기록을 지우는 일은 되돌리기 어려워 에이전트에 맡기지 않는다(기록 카드의 삭제 버튼)' },
  로컬_기록_이전: { excluded: '로그인 직후 한 번 묻는 계정 이전 — 사용자가 직접 고른다' },
  캘린더_월_이동: { excluded: '보기만 바꾸는 화면 조작 — 기록 내용은 조회 도구로 읽는다' },
  미리보기_크게_보기: { excluded: '보기만 바꾸는 화면 조작' },
} as const satisfies Record<string, CoverageEntry>;
