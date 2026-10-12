'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useIsClient, useLocalStorage } from 'usehooks-ts';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/constants';
import type { Theme } from '@/types';

type ThemeContextType = {
  /** 저장된 화면 모드. 미리보기 중이어도 이 값은 바뀌지 않는다. */
  theme: Theme;
  /** 화면 모드를 확정 저장한다 (미리보기 중이었다면 함께 해제). */
  setTheme: (theme: Theme) => void;
  /**
   * 저장하지 않고 화면에만 임시 적용하는 미리보기 값. `null` 이면 저장된 `theme` 을 그대로 쓴다.
   * 첫 진입 화면 모드 선택 다이얼로그가 "취소하면 원래대로" 를 만족하려면 localStorage 를
   * 건드리지 않고 화면만 바꿔야 하므로 이 경로를 쓴다.
   */
  setPreviewTheme: (theme: Theme | null) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// `<head>`에 동기 실행되어 첫 페인트 전에 `.dark` 클래스를 붙이는 스크립트.
// `useLocalStorage`(usehooks-ts)는 값을 JSON.stringify해서 저장하므로 JSON.parse로 읽는다.
// 저장값이 없으면(= 아직 화면 모드를 고른 적 없음) DEFAULT_THEME 을 쓴다.
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var t=s?JSON.parse(s):'${DEFAULT_THEME}';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var c=document.documentElement.classList;c.remove('light','dark');c.add(t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useLocalStorage<Theme>(THEME_STORAGE_KEY, DEFAULT_THEME);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const isClient = useIsClient();

  // 실제로 화면에 적용되는 값 — 미리보기가 걸려 있으면 그쪽이 우선.
  const appliedTheme = previewTheme ?? theme;

  // 확정 저장. 미리보기 상태를 남겨두면 저장값과 화면이 어긋나므로 함께 해제한다.
  const commitTheme = (next: Theme) => {
    setPreviewTheme(null);
    setTheme(next);
  };

  useEffect(() => {
    if (!isClient) return;

    const root = window.document.documentElement;

    const applyTheme = (t: 'light' | 'dark') => {
      root.classList.remove('light', 'dark');
      root.classList.add(t);
      root.style.colorScheme = t;
      // Tailwind v4 uses prefers-color-scheme by default.
      // If we want dark: classes to work when manually toggled to dark mode,
      // we need to make sure the class is there.
      // The @custom-variant in globals.css handles this.
    };

    if (appliedTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemThemeChange = () => {
        applyTheme(mediaQuery.matches ? 'dark' : 'light');
      };

      handleSystemThemeChange();
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else {
      applyTheme(appliedTheme);
    }
  }, [appliedTheme, isClient]);

  // Prevent hydration mismatch by only rendering children after mounting
  if (!isClient) {
    return (
      <ThemeContext.Provider value={{ theme: DEFAULT_THEME, setTheme: () => {}, setPreviewTheme: () => {} }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: commitTheme, setPreviewTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
