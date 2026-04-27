'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, KeyRound, Link2, Lock, Mail } from 'lucide-react';
import { useAccountInfo } from '.';

export function SettingsMenu() {
  const { currentEmail, identities, isLoaded } = useAccountInfo();

  const hasPassword = identities.some((i) => i.provider === 'email');
  const hasGithub = identities.some((i) => i.provider === 'github');

  const passwordSubtitle = !isLoaded
    ? '불러오는 중...'
    : hasPassword
      ? '이메일·비밀번호로 로그인 가능'
      : '아직 설정되지 않았어요. 설정하면 이메일 로그인이 활성화돼요.';

  const socialSubtitle = !isLoaded ? '불러오는 중...' : hasGithub ? 'GitHub 연결됨' : '연결된 외부 계정이 없어요.';

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">계정 설정</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          이메일, 비밀번호, 외부 계정 연동, 패스키를 항목별로 관리할 수 있어요.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        <MenuLink
          href="/settings/email"
          icon={<Mail size={18} />}
          title="이메일 변경"
          subtitle={isLoaded ? currentEmail || '이메일 정보 없음' : '불러오는 중...'}
        />
        <MenuLink
          href="/settings/password"
          icon={<Lock size={18} />}
          title={hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
          subtitle={passwordSubtitle}
        />
        <MenuLink href="/settings/social" icon={<Link2 size={18} />} title="외부 계정 연동" subtitle={socialSubtitle} />
        <MenuLink
          href="/settings/passkeys"
          icon={<KeyRound size={18} />}
          title="패스키 관리"
          subtitle="비밀번호 없이 Face ID / 지문 / Windows Hello 로 로그인"
        />
      </ul>
    </div>
  );
}

type MenuLinkProps = {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
};
function MenuLink({ href, icon, title, subtitle }: Readonly<MenuLinkProps>) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
      >
        <div className="rounded-lg bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-zinc-900 dark:text-white">{title}</div>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-zinc-400" />
      </Link>
    </li>
  );
}
