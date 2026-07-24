'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun, X } from 'lucide-react';
import { useScrollLock } from 'usehooks-ts';
import {
  DEFAULT_THEME,
  DIALOG_PRIORITY_THEME_PROMPT,
  DIALOG_THEME_PROMPT,
  THEME_PROMPT_SEEN_KEY,
  THEME_STORAGE_KEY,
} from '@/constants';
import { useDialogQueueStore, useIsActiveDialog } from '@/stores';
import type { Theme } from '@/types';
import { cn } from '@/utils';
import { Portal, useDeferOpenDuringViewTransition, useDismissOnBack, useTheme } from '.';

// 화면 모드 선택지 — ThemeToggle 과 같은 라이트 → 다크 → 자동 순서를 유지한다.
const THEME_OPTIONS = [
  { value: 'light', label: '라이트', description: '항상 밝은 화면', Icon: Sun },
  { value: 'dark', label: '다크', description: '항상 어두운 화면', Icon: Moon },
  { value: 'system', label: '자동', description: '기기 설정을 따라감', Icon: Monitor },
] as const satisfies ReadonlyArray<{ value: Theme; label: string; description: string; Icon: typeof Sun }>;

// 아직 화면 모드를 한 번도 고르지 않았는지 판정.
// `theme` 키가 없고(= ThemeProvider 가 기본값만 쓰는 상태) 이 다이얼로그를 거친 적도 없어야 한다.
const shouldAskThemeMode = (): boolean => {
  try {
    return (
      window.localStorage.getItem(THEME_PROMPT_SEEN_KEY) === null &&
      window.localStorage.getItem(THEME_STORAGE_KEY) === null
    );
  } catch {
    return false;
  }
};

// 확정이든 취소든 한 번 거쳤으면 다시 묻지 않는다.
const markThemePromptSeen = () => {
  try {
    window.localStorage.setItem(THEME_PROMPT_SEEN_KEY, '1');
  } catch {
    // 무시
  }
};

// 서비스에 처음 진입했을 때 한 번 뜨는 화면 모드 선택 다이얼로그.
// 카드를 고르면 화면에 즉시 미리보기로 반영되지만 저장되지는 않는다.
// - "시작하기": 고른 값을 확정 저장
// - 취소(X / 바깥 클릭 / Esc / back): 미리보기를 되돌려 기본값(DEFAULT_THEME) 그대로 둔다
// 어느 쪽이든 다시 묻지 않도록 THEME_PROMPT_SEEN_KEY 는 기록한다.
export function ThemePromptDialog() {
  const { setTheme, setPreviewTheme } = useTheme();
  const [selected, setSelected] = useState<Theme>(DEFAULT_THEME);

  const request = useDialogQueueStore((s) => s.request);
  const release = useDialogQueueStore((s) => s.release);
  // 큐에서 자신이 활성일 때만 실제로 열린다 (새소식 등 다른 자동 다이얼로그와 동시 노출 방지).
  const isActive = useIsActiveDialog(DIALOG_THEME_PROMPT);

  // 페이지 진입 View Transition 이 진행 중이면 전환이 끝난 뒤에 열리도록 한 박자 미룬다.
  const deferredOpen = useDeferOpenDuringViewTransition(isActive);

  const { lock, unlock } = useScrollLock({ autoLock: false });
  useEffect(() => {
    if (deferredOpen) lock();
    else unlock();
    return () => unlock();
  }, [deferredOpen, lock, unlock]);

  useEffect(() => {
    if (!shouldAskThemeMode()) return;
    request(DIALOG_THEME_PROMPT, DIALOG_PRIORITY_THEME_PROMPT);
    return () => release(DIALOG_THEME_PROMPT);
  }, [request, release]);

  // 라우트 이탈 등으로 다이얼로그가 사라질 때 미리보기가 남지 않도록 정리한다.
  // (setPreviewTheme 은 useState setter 를 그대로 노출한 것이라 참조가 안정적이다)
  useEffect(() => () => setPreviewTheme(null), [setPreviewTheme]);

  // "시작하기" — 고른 값을 확정 저장한다 (setTheme 이 미리보기도 함께 해제).
  const confirmAndClose = () => {
    setTheme(selected);
    markThemePromptSeen();
    release(DIALOG_THEME_PROMPT);
  };

  // 취소(X / 바깥 클릭 / back / Esc) — 미리보기를 되돌려 열기 전 상태로 복구한다.
  // localStorage 의 theme 키는 애초에 건드리지 않았으므로 기본값(DEFAULT_THEME)이 그대로 유지된다.
  const cancelAndClose = useCallback(() => {
    setPreviewTheme(null);
    markThemePromptSeen();
    release(DIALOG_THEME_PROMPT);
  }, [setPreviewTheme, release]);

  useDismissOnBack(deferredOpen, cancelAndClose);

  useEffect(() => {
    if (!deferredOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelAndClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deferredOpen, cancelAndClose]);

  // 선택은 화면에만 반영한다 — 저장은 "시작하기" 를 눌렀을 때만.
  const handleSelect = (theme: Theme) => {
    setSelected(theme);
    setPreviewTheme(theme);
  };

  if (!deferredOpen) return null;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-prompt-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
        // root snapshot 에서 분리된 별도 view-transition group 으로 만든다.
        // 첫 진입 직후엔 데이터가 채워지며 View Transition 이 연달아 돌고, 그동안 화면은
        // `::view-transition` 스냅샷으로 덮인다. 이 다이얼로그는 스냅샷이 찍힌 뒤에 DOM 에
        // 붙기 때문에(Portal 이 dynamic ssr:false) root 스냅샷에 포함되지 못해 떴다 사라졌다
        // 하는 깜빡임이 생겼다. 별도 group 으로 분리하면 전환 중에도 자기 자리에 그대로 그려진다.
        style={{ viewTransitionName: 'auto-dialog' }}
        onClick={cancelAndClose}
      >
        <div
          className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={cancelAndClose}
            aria-label="닫기"
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center px-6 pt-8 pb-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Moon className="h-6 w-6" />
            </div>
            <h2 id="theme-prompt-title" className="mt-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              화면 모드를 골라주세요
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              고르면 바로 미리 볼 수 있어요. &lsquo;시작하기&rsquo;를 눌러야 저장돼요.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="화면 모드"
            className="grid grid-cols-3 gap-2 px-5 pt-4"
            data-slot="theme-options"
          >
            {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
              const isSelected = selected === value;

              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(value)}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-4 transition-all',
                    isSelected
                      ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'
                    )}
                  />
                  <span
                    className={cn(
                      'text-sm font-bold',
                      isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">{description}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 p-5 pt-4">
            <button
              type="button"
              onClick={confirmAndClose}
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              시작하기
            </button>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              화면 모드는 언제든 상단바에서 다시 바꿀 수 있어요.
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
