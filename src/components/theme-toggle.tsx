'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { useIsClient } from 'usehooks-ts';
import { useTheme } from './theme-provider';
import { cn } from '@/utils';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();

  const handleSetTheme = (newTheme: typeof theme) => {
    setTheme(newTheme);

    const messages = {
      light: '라이트 모드로 변경되었습니다.',
      dark: '다크 모드로 변경되었습니다.',
      system: '시스템 설정으로 변경되었습니다.',
    };

    toast.success(messages[newTheme]);
  };

  if (!isClient) {
    return (
      <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="p-1.5">
          <Sun size={16} className="text-transparent" />
        </div>
        <div className="p-1.5">
          <Moon size={16} className="text-transparent" />
        </div>
        <div className="p-1.5">
          <Monitor size={16} className="text-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
      <button
        onClick={() => handleSetTheme('light')}
        className={cn(
          'rounded-md p-1.5 transition-all',
          theme === 'light'
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
        )}
        title="라이트 모드"
      >
        <Sun size={16} />
      </button>
      <button
        onClick={() => handleSetTheme('dark')}
        className={cn(
          'rounded-md p-1.5 transition-all',
          theme === 'dark'
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
        )}
        title="다크 모드"
      >
        <Moon size={16} />
      </button>
      <button
        onClick={() => handleSetTheme('system')}
        className={cn(
          'rounded-md p-1.5 transition-all',
          theme === 'system'
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
        )}
        title="시스템 설정"
      >
        <Monitor size={16} />
      </button>
    </div>
  );
}
