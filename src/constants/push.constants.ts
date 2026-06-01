// Web Push 알림 관련 상수.

/** Service Worker 스크립트 경로 (public/sw.js → /sw.js). 스코프 '/'. */
export const SERVICE_WORKER_PATH = '/sw.js';

/** 작성 알림 notification tag — 동일 tag 는 OS 가 1건으로 합쳐 중복 표시를 막는다. */
export const WORK_REPORT_REMINDER_TAG = 'work-report-reminder';

/** 알림 클릭 시 열리는 기본 경로 (보고서 작성 폼이 있는 홈). */
export const WORK_REPORT_REMINDER_URL = '/';

/** 작성 알림 문구 (크론 발송 payload). */
export const WORK_REPORT_REMINDER_TITLE = '오늘 업무 보고 작성하기';
export const WORK_REPORT_REMINDER_BODY = '아직 오늘 업무 보고를 작성하지 않았어요. 오후 5시 전까지 작성해주세요.';

/** 로그인 후 홈에서 뜨는 구독 권유 다이얼로그를 "나중에/닫기"로 닫았음을 기억하는 localStorage 키. */
export const PUSH_PROMPT_DISMISSED_KEY = 'push_subscribe_prompt_dismissed';
