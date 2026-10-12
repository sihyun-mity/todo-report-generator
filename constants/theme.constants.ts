import type { Theme } from '@/types';

/** 화면 모드를 저장하는 localStorage 키. usehooks-ts `useLocalStorage` 가 JSON 으로 직렬화해 저장한다. */
export const THEME_STORAGE_KEY = 'theme';

/** 아직 화면 모드를 고른 적 없는 사용자에게 적용되는 기본값. */
export const DEFAULT_THEME: Theme = 'dark';

/** 첫 진입 화면 모드 선택 다이얼로그를 이미 거쳤음을 기억하는 localStorage 키. */
export const THEME_PROMPT_SEEN_KEY = 'theme_prompt_seen';
