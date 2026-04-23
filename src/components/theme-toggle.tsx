'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import { useIsClient } from 'usehooks-ts';
import { useTheme } from '.';
import { cn } from '@/utils';

type ThemeToggleProps = {
  // 드롭다운 등 좁은 컨테이너 안에서 좌측 정렬로 공간이 비어 보이지 않도록 가득 채우는 옵션
  fullWidth?: boolean;
};

export function ThemeToggle({ fullWidth = false }: Readonly<ThemeToggleProps> = {}) {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();

  const handleSetTheme = (newTheme: typeof theme) => {
    // 동일한 테마를 다시 눌렀을 땐 불필요한 상태 갱신/토스트를 방지
    if (newTheme === theme) return;

    setTheme(newTheme);

    const messages = {
      light: '라이트 모드로 변경되었습니다.',
      dark: '다크 모드로 변경되었습니다.',
      system: '시스템 설정으로 변경되었습니다.',
    };

    toast.success(messages[newTheme]);
  };

  const containerCls = cn(
    'flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-0.5 dark:border-zinc-700/50 dark:bg-card/50',
    fullWidth && 'w-full'
  );
  const buttonSizingCls = fullWidth ? 'h-8 flex-1' : 'h-8 w-8';

  if (!isClient) {
    return (
      <div className={containerCls}>
        <div className={cn('flex items-center justify-center', buttonSizingCls)}>
          <Sun size={16} className="text-transparent" />
        </div>
        <div className={cn('flex items-center justify-center', buttonSizingCls)}>
          <Moon size={16} className="text-transparent" />
        </div>
        <div className={cn('flex items-center justify-center', buttonSizingCls)}>
          <Monitor size={16} className="text-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className={containerCls}>
      <button
        onClick={() => handleSetTheme('light')}
        className={cn(
          'flex cursor-pointer items-center justify-center rounded-md transition-all',
          buttonSizingCls,
          theme === 'light'
            ? 'bg-zinc-100 text-zinc-900 dark:bg-toast-border/50 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
        )}
        title="라이트 모드"
      >
        <Sun size={16} />
      </button>
      <button
        onClick={() => handleSetTheme('dark')}
        className={cn(
          'flex cursor-pointer items-center justify-center rounded-md transition-all',
          buttonSizingCls,
          theme === 'dark'
            ? 'bg-zinc-100 text-zinc-900 dark:bg-toast-border/50 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
        )}
        title="다크 모드"
      >
        <Moon size={16} />
      </button>
      <button
        onClick={() => handleSetTheme('system')}
        className={cn(
          'flex cursor-pointer items-center justify-center rounded-md transition-all',
          buttonSizingCls,
          theme === 'system'
            ? 'bg-zinc-100 text-zinc-900 dark:bg-toast-border/50 dark:text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
        )}
        title="시스템 설정"
      >
        <Monitor size={16} />
      </button>
    </div>
  );
}
