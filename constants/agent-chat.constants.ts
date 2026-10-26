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

/** 대화 기록은 컨텍스트 창에 맞춰 자른다. measureContextUsage 가 없는 브라우저에서만 이 개수로 자른다 */
export const AGENT_CHAT_FALLBACK_HISTORY_TURNS = 12;

/** 프롬프트를 맞출 때 응답을 위해 남겨 두는 토큰 — 구조화 출력(도구 선택·입력)과 답변 */
export const AGENT_CHAT_OUTPUT_RESERVE_TOKENS = { structured: 768, answer: 1_024 } as const;

/** 모델에게 넘기는 도구 결과 한 건의 최대 길이(글자). 컨텍스트가 모자라면 MIN 까지 반씩 줄인다 */
export const AGENT_CHAT_TOOL_RESULT_MAX_CHARS = 6_000;
export const AGENT_CHAT_TOOL_RESULT_MIN_CHARS = 400;

/** 모델 응답 한 번을 기다리는 최대 시간 — 넘기면 중단하고 오류로 알린다 */
export const AGENT_CHAT_PROMPT_TIMEOUT_MS = 90_000;

/** `list_news` 가 돌려주는 최대 소식 수 */
export const AGENT_NEWS_LIST_LIMIT = 10;

/** `get_news` 가 돌려주는 본문의 최대 길이(글자) */
export const AGENT_NEWS_CONTENT_MAX_CHARS = 3_000;

/** AI 도우미 사용 예시 — 지금 화면에 tool 이 등록돼 있을 때만 보여 주고, 무작위로 돌려 가며 할 수 있는 일을 알린다 */
export const AGENT_CHAT_EXAMPLES: ReadonlyArray<{ text: string; tool: string }> = [
  { text: '지금 작성 중인 보고서를 요약해줘', tool: 'get_current_report' },
  // 부탁이 아니라 업무 메모 — 도우미가 메모로 알아보고 보고서 초안을 만든다(입력창 하나로 둘 다 받는다는 걸 보여 주는 예시)
  { text: '오늘 로그인 오류 고쳤고 결제 페이지 리팩터링 절반 했어. 내일은 QA 회귀 테스트', tool: 'add_report_tasks' },
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

/** AI 도우미가 바꾼 칸을 강조하는 시간 — animation.css 의 agent-flash 길이와 맞춘다 */
export const AGENT_HIGHLIGHT_MS = 2_400;

/** 보고서 날짜를 바꿨을 때 강조 대상으로 쓰는 id */
export const AGENT_HIGHLIGHT_DATE_ID = 'report-date';

/** 변경 카드에 바로 보여 주는 줄 수 — 넘으면 "외 N건"으로 접는다 */
export const AGENT_CHANGE_VISIBLE_LINES = 6;

/** 데스크톱 AI 도우미 패널을 펼쳐 둘지(접으면 레일) 기억하는 localStorage 키 */
export const AGENT_PANEL_STORAGE_KEY = 'trg:agent-panel';

/** "메모로 보고서 쓰기"에 넣을 수 있는 메모 길이(글자) — Nano 컨텍스트 창(약 9천 토큰)에 프롬프트·응답과 함께 들어가도록 */
export const AGENT_NOTES_MAX_CHARS = 3_000;

/** 패널·홈 입력창에 보여 주는 상황 제안 수 */
export const AGENT_SUGGESTION_LIMIT = 4;

/** 상황 제안 알약 바깥 틀의 DOM id — 토스트가 이 요소를 하단 차단 요소로 보고 그 위로 비켜 뜬다(ToasterProvider) */
export const AGENT_SUGGESTION_PILL_ID = 'agent-suggestion-pill';

/** 상황 제안 알약을 띄우기 전 기다리는 시간 — 입력 중 상태가 출렁일 때마다 떴다 사라지지 않게 */
export const AGENT_SUGGESTION_PILL_DELAY_MS = 1_500;

/** 음성을 서버(브라우저 음성 인식 서비스)로 보내는 데 동의했는지 기억하는 localStorage 키 */
export const AGENT_VOICE_CLOUD_CONSENT_KEY = 'trg:agent-voice-cloud-consent';
