'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { KeyRound, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { disableGuestMode, enableGuestMode } from '@/lib/guest';
import { isConditionalUISupported, isWebAuthnSupported, loginWithPasskey } from '@/lib/webauthn/client';

type Mode = 'login' | 'signup';

interface Props {
  mode: Mode;
}

export default function AuthForm({ mode }: Props) {
  if (mode === 'signup') return <SignupForm />;
  return <LoginForm />;
}

function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGuestStart = async () => {
    try {
      await createClient().auth.signOut({ scope: 'local' });
    } catch {
      // 세션 없는 경우 정상 무시
    }
    enableGuestMode();
    toast.success('게스트로 시작합니다. 기록은 이 브라우저에만 저장돼요.');
    router.push('/');
    router.refresh();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (password !== confirmPassword) {
      toast.error('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setIsSubmitting(true);
    try {
      const supabase = createClient();
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">회원가입</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            id="email"
            label="이메일"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            required
          />
          <Field
            id="password"
            label="비밀번호"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            placeholder="6자 이상 입력해주세요"
            minLength={6}
            required
          />
          <Field
            id="confirm-password"
            label="비밀번호 확인"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="비밀번호를 다시 입력해주세요"
            minLength={6}
            required
            invalid={confirmPassword.length > 0 && confirmPassword !== password}
            error={
              confirmPassword.length > 0 && confirmPassword !== password ? '비밀번호가 일치하지 않습니다.' : undefined
            }
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isSubmitting ? '처리 중...' : '회원가입'}
          </button>
        </form>

        <p className="mt-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          가입 후 로그인하면 이 기기에 패스키를 등록해 비밀번호 없이 로그인할 수 있습니다.
        </p>

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            로그인
          </Link>
        </p>

        <Divider />

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

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyInFlight, setPasskeyInFlight] = useState(false);
  const autofillStarted = useRef(false);

  useEffect(() => {
    setPasskeySupported(isWebAuthnSupported());
  }, []);

  // 이메일 필드 확장 & 브라우저가 conditional UI 지원 시 autofill 시작
  useEffect(() => {
    if (!emailExpanded) return;
    if (autofillStarted.current) return;
    let cancelled = false;
    (async () => {
      if (!(await isConditionalUISupported())) return;
      if (cancelled) return;
      autofillStarted.current = true;
      try {
        await loginWithPasskey({ useAutofill: true });
        if (cancelled) return;
        disableGuestMode();
        toast.success('패스키로 로그인되었습니다.');
        router.push('/');
        router.refresh();
      } catch {
        // 사용자 취소/autofill 비활성 — 조용히 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailExpanded, router]);

  const handlePasskeyLogin = async () => {
    if (passkeyInFlight) return;
    setPasskeyInFlight(true);
    try {
      await loginWithPasskey({ useAutofill: false });
      disableGuestMode();
      toast.success('패스키로 로그인되었습니다.');
      router.push('/');
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      // 사용자가 passkey 프롬프트를 취소한 경우 (NotAllowedError 등) 토스트는 생략
      if (!/NotAllowedError|cancel|timed out/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setPasskeyInFlight(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      disableGuestMode();
      toast.success('로그인되었습니다.');
      router.push('/');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestStart = async () => {
    try {
      await createClient().auth.signOut({ scope: 'local' });
    } catch {
      // 무시
    }
    enableGuestMode();
    toast.success('게스트로 시작합니다. 기록은 이 브라우저에만 저장돼요.');
    router.push('/');
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">로그인</h1>

        {passkeySupported && (
          <>
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyInFlight}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <KeyRound size={16} />
              {passkeyInFlight ? '인증 중...' : '패스키로 로그인'}
            </button>
            <div className="my-5 flex items-center gap-3 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              또는
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </>
        )}

        {!emailExpanded ? (
          <button
            type="button"
            onClick={() => setEmailExpanded(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Mail size={16} />
            이메일로 로그인
          </button>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <Field
              id="email"
              label="이메일"
              type="email"
              autoComplete="username webauthn"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
            <Field
              id="password"
              label="비밀번호"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              placeholder="비밀번호를 입력해주세요"
              minLength={6}
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {isSubmitting ? '처리 중...' : '로그인'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
            회원가입
          </Link>
        </p>

        <Divider />

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

interface FieldProps {
  id: string;
  label: string;
  type: 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minLength?: number;
  required?: boolean;
  invalid?: boolean;
  error?: string;
}
function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  minLength,
  required,
  invalid,
  error,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 aria-invalid:border-red-400 aria-invalid:focus:ring-red-400/50 dark:border-zinc-700 dark:bg-zinc-950"
      />
      {error && <span className="mt-1 text-[11px] text-red-500">{error}</span>}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      또는
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
