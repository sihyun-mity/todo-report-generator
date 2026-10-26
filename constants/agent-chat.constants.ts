/** 에이전트 `navigate` 도구로 이동할 수 있는 화면. memberOnly 는 로그인 회원만, guestOnly 는 비회원만 이동할 수 있다. */
export const AGENT_PAGES = {
  home: { path: '/', label: '보고서 작성(홈) — 보고서 폼과 이전 기록 캘린더' },
  whats_new: { path: '/whats-new', label: '새소식 목록' },
  login: { path: '/login', label: '로그인', guestOnly: true },
  settings: { path: '/settings', label: '계정 설정 메뉴', memberOnly: true },
  settings_email: { path: '/settings/email', label: '이메일 변경', memberOnly: true },
  settings_password: { path: '/settings/password', label: '비밀번호 변경·설정', memberOnly: true },
  settings_social: { path: '/settings/social', label: '외부 계정(GitHub) 연동', memberOnly: true },
  settings_passkeys: { path: '/settings/passkeys', label: '패스키 관리', memberOnly: true },
  settings_sessions: { path: '/settings/sessions', label: '로그인 기기 관리', memberOnly: true },
  settings_notifications: { path: '/settings/notifications', label: '작성 알림 설정', memberOnly: true },
  settings_data: { path: '/settings/data', label: '저장된 데이터 관리', memberOnly: true },
  settings_withdraw: { path: '/settings/withdraw', label: '회원 탈퇴', memberOnly: true },
} as const satisfies Record<string, { path: string; label: string; memberOnly?: boolean; guestOnly?: boolean }>;

/** `navigate` 뒤 주소가 바뀔 때까지 기다리는 최대 시간 — 넘기면 이동 중인 것으로 보고 결과를 돌려준다 */
export const AGENT_NAVIGATE_WAIT_MS = 5_000;

/** 채팅 한 번의 요청에서 모델이 고를 수 있는 도구 호출 수. 넘기면 지금까지의 결과로 답하게 한다. */
export const AGENT_CHAT_MAX_TOOL_STEPS = 5;

/** 모델에게 다시 넘기는 최근 대화 수 — Gemini Nano 의 입력 한도가 작아 오래된 대화는 뺀다 */
export const AGENT_CHAT_HISTORY_TURNS = 12;

/** 모델에게 넘기는 도구 결과 한 건의 최대 길이(글자) */
export const AGENT_CHAT_TOOL_RESULT_MAX_CHARS = 1_800;

/** 모델 응답 한 번을 기다리는 최대 시간 — 넘기면 중단하고 오류로 알린다 */
export const AGENT_CHAT_PROMPT_TIMEOUT_MS = 90_000;

/** `list_news` 가 돌려주는 최대 소식 수 */
export const AGENT_NEWS_LIST_LIMIT = 10;

/** `get_news` 가 돌려주는 본문의 최대 길이(글자) */
export const AGENT_NEWS_CONTENT_MAX_CHARS = 3_000;

/** AI 도우미 사용 예시 — 지금 화면에 tool 이 등록돼 있을 때만 보여 주고, 무작위로 돌려 가며 할 수 있는 일을 알린다 */
export const AGENT_CHAT_EXAMPLES: ReadonlyArray<{ text: string; tool: string }> = [
  { text: '지금 작성 중인 보고서를 요약해줘', tool: 'get_current_report' },
  { text: '오늘 할 일에 "주간 회의" 프로젝트 "안건 정리" 작업 추가해줘', tool: 'add_report_tasks' },
  { text: '금일 업무에 "API 연동" 작업을 진행률 70%로 추가해줘', tool: 'add_report_tasks' },
  { text: '내일 할 일에 "QA" 프로젝트 "회귀 테스트" 넣어줘', tool: 'add_report_tasks' },
  { text: '오늘 미완료 업무를 내일 할 일로 옮겨줘', tool: 'carry_over_incomplete_tasks' },
  { text: '익일 업무를 "배포 준비" 작업 하나로 바꿔줘', tool: 'replace_report_section' },
  { text: '보고서 날짜를 어제로 바꿔줘', tool: 'set_report_date' },
  { text: '지난주에 쓴 보고서를 요약해줘', tool: 'search_reports' },
  { text: '이번 달 보고서에서 "로그인" 관련 작업 찾아줘', tool: 'search_reports' },
  { text: '지난달 내가 한 일을 프로젝트별로 정리해줘', tool: 'search_reports' },
  { text: '보고서를 저장한 날짜 목록 보여줘', tool: 'list_report_dates' },
  { text: '어제 보고서를 폼으로 불러와줘', tool: 'load_report' },
  { text: '작성 중인 보고서를 저장해줘', tool: 'save_report' },
  { text: '보고서 기록을 텍스트 파일로 내보내줘', tool: 'export_reports' },
  { text: 'GitHub 커밋 가져오기 열어줘', tool: 'open_github_import' },
  { text: '최근 새소식 알려줘', tool: 'list_news' },
  { text: '새소식 화면으로 가줘', tool: 'navigate' },
  { text: '다크 모드로 바꿔줘', tool: 'set_theme' },
  { text: '화면 모드를 기기 설정에 맞춰줘', tool: 'set_theme' },
  { text: '지금 무슨 화면이야?', tool: 'get_app_context' },
];

/** 대화 중 예시 칩이 바뀌는 간격 */
export const AGENT_CHAT_EXAMPLE_ROTATE_MS = 4_000;

/** 첫 화면에 보여 주는 예시 수 */
export const AGENT_CHAT_EXAMPLE_COUNT = 4;
