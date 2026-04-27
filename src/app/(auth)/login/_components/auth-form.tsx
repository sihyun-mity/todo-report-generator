'use client';

import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Github, KeyRound, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { disableGuestMode, enableGuestMode } from '@/lib/guest';
import { isConditionalUISupported, isWebAuthnSupported, loginWithPasskey } from '@/lib/webauthn/client';
import { useReportFormStore, useReportHistoryStore } from '@/stores';

// 사용자 전환 시 이전 세션의 store 캐시(보고서 기록·작성 중 폼)를 비운다
const resetSessionStores = () => {
  useReportHistoryStore.getState().reset();
  useReportFormStore.getState().resetSession();
};

const startGithubOAuth = async () => {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) toast.error(error.message);
};

type Mode = 'login' | 'signup';

type Props = {
  mode: Mode;
};

export function AuthForm({ mode }: Readonly<Props>) {
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
    resetSessionStores();
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
      // 게스트에서 계정으로 전환하는 시점 — 이메일 인증 링크 클릭 후 홈으로 돌아왔을 때
      // 게스트 쿠키가 남아있으면 미들웨어가 게스트로 취급해 세션을 무시하므로 여기서 미리 정리
      disableGuestMode();
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
    <AuthCard title="회원가입">
      <div className="flex flex-col gap-3">
        <AuthButton variant="github" onClick={startGithubOAuth} icon={<Github size={18} />}>
          GitHub로 가입
        </AuthButton>
        <p className="-mt-1 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          처음이라면 자동으로 계정이 만들어지고 이메일 인증도 자동 처리돼요.
        </p>
      </div>

      <Divider label="또는 이메일로 가입" />

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
        <AuthButton type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? '처리 중...' : '이메일로 가입'}
        </AuthButton>
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

      <GuestSection onStart={handleGuestStart} />
    </AuthCard>
  );
}

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  // SSR에서는 지원 여부를 알 수 없어 null로 시작 — 버튼은 항상 렌더링하고 mount 후 boolean으로 확정.
  // 이렇게 하면 버튼이 "안 보였다가 갑자기 나타나는" 깜빡임이 사라진다.
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
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
        resetSessionStores();
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
    // mount 전 클릭(supported=null)이거나 미지원이면 안내 후 종료
    const supported = passkeySupported ?? isWebAuthnSupported();
    if (!supported) {
      toast.error('이 브라우저는 패스키(WebAuthn)를 지원하지 않아요. GitHub 또는 이메일로 로그인해주세요.');
      return;
    }
    setPasskeyInFlight(true);
    try {
      await loginWithPasskey({ useAutofill: false });
      disableGuestMode();
      resetSessionStores();
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
      resetSessionStores();
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
    resetSessionStores();
    toast.success('게스트로 시작합니다. 기록은 이 브라우저에만 저장돼요.');
    router.push('/');
    router.refresh();
  };

  return (
    <AuthCard title="로그인">
      <div className="flex flex-col gap-3">
        <AuthButton
          variant="passkey"
          onClick={handlePasskeyLogin}
          disabled={passkeyInFlight || passkeySupported === false}
          title={passkeySupported === false ? '이 브라우저는 패스키(WebAuthn)를 지원하지 않아요' : undefined}
          icon={<KeyRound size={18} />}
        >
          {passkeyInFlight ? '인증 중...' : '패스키로 로그인'}
        </AuthButton>

        <AuthButton variant="github" onClick={startGithubOAuth} icon={<Github size={18} />}>
          GitHub로 로그인
        </AuthButton>

        {!emailExpanded ? (
          <AuthButton variant="email" onClick={() => setEmailExpanded(true)} icon={<Mail size={18} />}>
            이메일로 로그인
          </AuthButton>
        ) : (
          <form
            onSubmit={handlePasswordSubmit}
            className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
          >
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
            <AuthButton type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? '처리 중...' : '이메일로 로그인'}
            </AuthButton>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
        아직 계정이 없으신가요?{' '}
        <Link href="/signup" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
          회원가입
        </Link>
      </p>

      <GuestSection onStart={handleGuestStart} />
    </AuthCard>
  );
}

type AuthCardProps = {
  title: string;
  children: ReactNode;
};
function AuthCard({ title, children }: Readonly<AuthCardProps>) {
  return (
    <div className="flex min-h-screen-enhanced items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
        {children}
      </div>
    </div>
  );
}

type AuthButtonVariant = 'passkey' | 'github' | 'email' | 'primary';
type AuthButtonProps = {
  type?: 'button' | 'submit';
  variant: AuthButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
};

// 로그인 수단 버튼: 아이콘은 좌측에 절대 위치로 고정해 길이 차이가 있어도 라벨이 항상 정중앙에 정렬되게 한다.
// 모든 variant에 shadow를 줘 ghost 스타일의 게스트 버튼과 시각 위계를 만든다.
function AuthButton({ type = 'button', variant, onClick, disabled, title, icon, children }: Readonly<AuthButtonProps>) {
  const variantClass = (() => {
    switch (variant) {
      case 'passkey':
        // 가장 권장되는 수단 — 파란 톤으로 강하게 강조
        return 'border-transparent bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500';
      case 'github':
        // GitHub 브랜드 카본 톤 — 라이트는 검정, 다크는 반전(흰)
        return 'border-transparent bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white';
      case 'email':
        return 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700';
      case 'primary':
        return 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-zinc-200';
    }
  })();

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative flex w-full items-center justify-center rounded-xl border px-12 py-3 text-sm font-semibold shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm ${variantClass}`}
    >
      {icon && <span className="absolute left-4 flex items-center">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
}

type GuestSectionProps = {
  onStart: () => void;
};
// 카드 맨 아래에 위치. "또는" Divider로 분리한 후 가벼운 border만 있는 outline 버튼.
// 다른 로그인 버튼은 색상·shadow로 강조되므로 게스트 버튼은 자연스럽게 한 단계 약하게 보인다.
function GuestSection({ onStart }: Readonly<GuestSectionProps>) {
  return (
    <>
      <Divider />
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        게스트로 시작하기
      </button>
      <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
        기록은 이 브라우저에만 저장되며, 나중에 로그인하면 계정으로 이전할 수 있어요.
      </p>
    </>
  );
}

type FieldProps = {
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
};
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
}: Readonly<FieldProps>) {
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

type DividerProps = {
  label?: string;
};
function Divider({ label = '또는' }: Readonly<DividerProps>) {
  return (
    <div className="my-5 flex items-center gap-3 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      {label}
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
