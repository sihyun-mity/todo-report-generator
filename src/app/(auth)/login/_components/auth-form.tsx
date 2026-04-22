'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { disableGuestMode, enableGuestMode } from '@/lib/guest';

type Mode = 'login' | 'signup';

interface Props {
  mode: Mode;
}

const COPY = {
  login: {
    title: '로그인',
    cta: '로그인',
    altText: '아직 계정이 없으신가요?',
    altLink: '/signup',
    altLinkLabel: '회원가입',
  },
  signup: {
    title: '회원가입',
    cta: '회원가입',
    altText: '이미 계정이 있으신가요?',
    altLink: '/login',
    altLinkLabel: '로그인',
  },
} as const;

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = COPY[mode];

  const handleGuestStart = () => {
    enableGuestMode();
    toast.success('게스트로 시작합니다. 기록은 이 브라우저에만 저장돼요.');
    router.push('/');
    router.refresh();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (mode === 'signup' && password !== confirmPassword) {
      toast.error('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(`${email}로 인증 메일을 발송했습니다. 메일의 링크를 눌러 인증을 완료한 뒤 로그인해주세요.`, {
          duration: 6000,
        });
        router.push('/login');
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      // 로그인 성공 시 게스트 모드 해제 (로컬 기록 이전 dialog가 자연스럽게 뜨도록)
      disableGuestMode();
      toast.success('로그인되었습니다.');
      router.push('/');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">{copy.title}</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>

          {mode === 'signup' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor="confirm-password">
                비밀번호 확인
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={confirmPassword.length > 0 && confirmPassword !== password}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 aria-invalid:border-red-400 aria-invalid:focus:ring-red-400/50 dark:border-zinc-700 dark:bg-zinc-950"
              />
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <span className="mt-1 text-[11px] text-red-500">비밀번호가 일치하지 않습니다.</span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isSubmitting ? '처리 중...' : copy.cta}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {copy.altText}{' '}
          <Link href={copy.altLink} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            {copy.altLinkLabel}
          </Link>
        </p>

        <div className="my-5 flex items-center gap-3 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          또는
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleGuestStart}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          게스트로 시작하기
        </button>
        <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          로그인 없이 사용할 수 있어요. 기록은 이 브라우저에만 저장되며, 나중에 로그인하면 계정으로 이전할 수 있어요.
        </p>
      </div>
    </div>
  );
}
