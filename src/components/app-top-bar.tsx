'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Home, LogIn, LogOut, Settings, User, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { disableGuestMode, isGuestMode } from '@/lib/guest';
import { useOnClickOutside } from '@/hooks';

// 인증된 영역의 공용 상단바
// - 로고/브랜드: '/'로 이동
// - 우측 사용자 메뉴 드롭다운: 이메일, 설정, 로그아웃 (향후 테마/알림 등을 여기에 추가)
export default function AppTopBar() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const userEmail = data.user?.email ?? null;
      setEmail(userEmail);
      setIsGuest(!userEmail && isGuestMode());
    });
  }, []);

  useOnClickOutside(menuRef, () => setIsOpen(false));

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsOpen(false);
    router.push('/login');
    router.refresh();
  };

  const handleExitGuest = () => {
    disableGuestMode();
    setIsOpen(false);
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/70 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-12">
        <Link
          href="/"
          aria-label="홈으로"
          className="flex items-center justify-center rounded-lg p-2 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Home size={18} />
        </Link>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card dark:text-zinc-300 dark:hover:bg-[#2c2e33]"
          >
            {isGuest ? <UserRound size={14} /> : <User size={14} />}
            <span className="max-w-[160px] truncate">{email ?? (isGuest ? '게스트' : '계정')}</span>
            <ChevronDown size={12} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>

          {isOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            >
              {isGuest ? (
                <>
                  <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <div className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">게스트 모드</div>
                    <div className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-200">
                      기록은 이 브라우저에만 저장돼요.
                    </div>
                  </div>
                  <Link
                    role="menuitem"
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <LogIn size={14} />
                    로그인 / 회원가입
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={handleExitGuest}
                    className="flex w-full items-center gap-2 border-t border-zinc-100 px-4 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <LogOut size={14} />
                    게스트 모드 종료
                  </button>
                </>
              ) : (
                <>
                  <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <div className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">로그인 계정</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-700 dark:text-zinc-200">{email ?? '-'}</div>
                  </div>
                  <Link
                    role="menuitem"
                    href="/settings"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Settings size={14} />
                    계정 설정
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 border-t border-zinc-100 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-red-400 dark:hover:bg-zinc-800"
                  >
                    <LogOut size={14} />
                    로그아웃
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
