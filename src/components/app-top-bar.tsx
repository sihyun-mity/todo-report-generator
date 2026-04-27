'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Github, Home, LogIn, LogOut, Megaphone, Settings, User, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { disableGuestMode, isGuestMode } from '@/lib/guest';
import { useOnClickOutside } from '@/hooks';
import { useReportFormStore, useReportHistoryStore } from '@/stores';
import { ThemeToggle } from '.';

// SSR에서는 항상 false, 클라이언트에서는 쿠키를 읽어 동기화 — hydration mismatch 방지
const subscribeNoop = () => () => {};
const getGuestSnapshot = () => isGuestMode();
const getGuestServerSnapshot = () => false;

// 인증된 영역의 공용 상단바
// - 로고/브랜드: '/'로 이동
// - 우측 사용자 메뉴 드롭다운: 이메일, 설정, 로그아웃 (향후 테마/알림 등을 여기에 추가)
export function AppTopBar() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const isGuest = useSyncExternalStore(subscribeNoop, getGuestSnapshot, getGuestServerSnapshot);

  // 표시명: GitHub 연동 시 닉네임 우선, 그 외에는 이메일
  const displayName = githubUsername ?? email;

  useEffect(() => {
    // 게스트 쿠키가 있으면 Supabase 호출을 건너뛴다 — stale 토큰으로 인한 refresh 오류 방지
    if (isGuest) return;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const user = data.user;
        setEmail(user?.email ?? null);
        const githubIdentity = user?.identities?.find((i) => i.provider === 'github');
        const userName = githubIdentity?.identity_data?.user_name;
        setGithubUsername(typeof userName === 'string' ? userName : null);
      })
      .catch(() => {
        setEmail(null);
        setGithubUsername(null);
      });
  }, [isGuest]);

  useOnClickOutside(menuRef, () => setIsOpen(false));

  // 사용자 전환 시 모듈 레벨 store가 stale 상태로 남지 않도록 초기화한다
  const resetSessionStores = () => {
    useReportHistoryStore.getState().reset();
    useReportFormStore.getState().resetSession();
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetSessionStores();
    setIsOpen(false);
    router.push('/login');
    router.refresh();
  };

  const handleExitGuest = () => {
    disableGuestMode();
    resetSessionStores();
    setIsOpen(false);
    router.push('/login');
    router.refresh();
  };

  return (
    <div
      style={{ viewTransitionName: 'site-header' }}
      className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/70 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/70"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-12">
        <Link
          href="/"
          aria-label="홈으로"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card/50 dark:text-zinc-200 dark:hover:bg-[#2c2e33]"
        >
          <Home size={16} />
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card/50 dark:text-zinc-300 dark:hover:bg-[#2c2e33]"
            >
              {isGuest ? <UserRound size={16} /> : <User size={16} />}
              <span className="max-w-[160px] truncate">{displayName ?? (isGuest ? '게스트' : '계정')}</span>
              <ChevronDown size={14} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {isOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
              >
                {isGuest ? (
                  <>
                    <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                      <div className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                        게스트 모드
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-200">
                        기록은 이 브라우저에만 저장돼요.
                      </div>
                    </div>
                    <div className="border-b border-zinc-100 px-4 py-3 sm:hidden dark:border-zinc-800">
                      <div className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">테마</div>
                      <ThemeToggle fullWidth />
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
                    <Link
                      role="menuitem"
                      href="/whats-new"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Megaphone size={14} />
                      새소식
                    </Link>
                    <a
                      role="menuitem"
                      href="https://github.com/sihyun-mity/todo-report-generator"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Github size={14} />
                      GitHub에서 의견 남기기
                    </a>
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
                      <div className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                        로그인 계정
                      </div>
                      <div className="mt-0.5 truncate text-xs text-zinc-700 dark:text-zinc-200">
                        {displayName ?? '-'}
                      </div>
                      {githubUsername && email && (
                        <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{email}</div>
                      )}
                    </div>
                    <div className="border-b border-zinc-100 px-4 py-3 sm:hidden dark:border-zinc-800">
                      <div className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">테마</div>
                      <ThemeToggle fullWidth />
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
                    <Link
                      role="menuitem"
                      href="/whats-new"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Megaphone size={14} />
                      새소식
                    </Link>
                    <a
                      role="menuitem"
                      href="https://github.com/sihyun-mity/todo-report-generator"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Github size={14} />
                      GitHub에서 의견 남기기
                    </a>
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
    </div>
  );
}
