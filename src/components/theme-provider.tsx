'use client';

import { createContext, useContext, useEffect } from 'react';
import { useIsClient, useLocalStorage } from 'usehooks-ts';

type Theme = 'light' | 'dark' | 'system';

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// `<head>`에 동기 실행되어 첫 페인트 전에 `.dark` 클래스를 붙이는 스크립트.
// `useLocalStorage`(usehooks-ts)는 값을 JSON.stringify해서 저장하므로 JSON.parse로 읽는다.
export const themeInitScript = `(function(){try{var s=localStorage.getItem('theme');var t=s?JSON.parse(s):'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var c=document.documentElement.classList;c.remove('light','dark');c.add(t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useLocalStorage<Theme>('theme', 'system');
  const isClient = useIsClient();

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

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemThemeChange = () => {
        applyTheme(mediaQuery.matches ? 'dark' : 'light');
      };

      handleSystemThemeChange();
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else {
      applyTheme(theme);
    }
  }, [theme, isClient]);

  // Prevent hydration mismatch by only rendering children after mounting
  if (!isClient) {
    return <ThemeContext.Provider value={{ theme: 'system', setTheme: () => {} }}>{children}</ThemeContext.Provider>;
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
