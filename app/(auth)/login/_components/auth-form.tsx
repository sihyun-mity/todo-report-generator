'use client';

import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardList, Github, KeyRound, Mail } from 'lucide-react';
import { WebAuthnAbortService } from '@simplewebauthn/browser';
import Link from 'next/link';
import { CloseIcon, closeButtonClassName } from '@/components';
import { useSearchParams } from 'next/navigation';
import { useWebAuthnSupported } from '@/hooks';
import { createClient } from '@/lib/supabase/client';
import { disableGuestMode, enableGuestMode } from '@/lib/guest';
import { migrateGuestNewsLastSeen, stashGuestNewsLastSeenInCookie } from '@/lib/news';
import { isConditionalUISupported, isWebAuthnSupported, loginWithPasskey } from '@/lib/webauthn/client';
import { hardNavigate } from '@/utils';

const startGithubOAuth = async () => {
  // 게스트 → OAuth 로그인 직전: 마지막으로 본 새소식 id 를 짧은 쿠키로 옮겨둔다.
  // GitHub redirect 후 /auth/callback 에서 user_news_reads 로 마이그레이션된다.
  stashGuestNewsLastSeenInCookie();

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

// 로그인 흐름 도중 redirect 로 전달된 오류(예: /auth/callback 의 `?error=...`)를 토스트로 알린다.
// 폼 자체는 URL 과 무관한 정적 셸로 프리렌더되도록, 요청 시점에만 알 수 있는 search param 읽기를
// 이 컴포넌트로 격리해 page 에서 <Suspense> 로 감싼다.
export function AuthErrorToast() {
  const error = useSearchParams().get('error');
  // 같은 오류로 두 번 토스트하지 않도록 마지막으로 처리한 값을 기억한다 (strict mode 이중 실행·
  // Activity 로 숨겨졌다 다시 보일 때 effect 재실행 대비). URL 정리 후 error 가 비면 초기화해
  // 이후 같은 오류로 다시 들어온 경우엔 다시 알린다.
  const handledError = useRef<string | null>(null);

  useEffect(() => {
    if (!error) {
      handledError.current = null;
      return;
    }
    if (handledError.current === error) return;
    handledError.current = error;
    toast.error(humanizeAuthError(error));
    // URL 에 남은 ?error=... 를 제거해 새로고침/공유 시 다시 토스트가 뜨지 않도록 한다.
    // next router 의 replace 는 RSC re-render 를 유발하므로 history API 로 직접 정리한다.
    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete('error');
    const search = cleaned.searchParams.toString();
    const newUrl = `${cleaned.pathname}${search ? `?${search}` : ''}${cleaned.hash}`;
    window.history.replaceState(window.history.state, '', newUrl);
  }, [error]);

  return null;
}

// Supabase / OAuth 가 돌려주는 raw 영어 메시지를 사용자용 한국어 문구로 매핑한다.
// 매칭 안 되는 코드는 일반 문구 + 원문을 함께 보여 디버깅에 도움.
function humanizeAuthError(raw: string): string {
  const normalized = raw.toLowerCase();
  if (normalized.includes('refresh token')) {
    return '이전 로그인 정보가 만료되어 다시 시도해야 해요. 다시 로그인해주세요.';
  }
  if (normalized === 'missing_code') {
    return '로그인 정보를 받지 못했어요. 다시 시도해주세요.';
  }
  if (normalized.includes('access_denied')) {
    return 'GitHub 인증을 취소했어요.';
  }
  if (normalized.includes('code') && (normalized.includes('used') || normalized.includes('expired'))) {
    return '로그인 정보가 만료됐어요. 다시 시도해주세요.';
  }
  if (normalized.includes('verifier') || normalized.includes('pkce')) {
    return '로그인 세션이 어긋났어요. 다시 시도해주세요.';
  }
  if (normalized.includes('server_error')) {
    return 'GitHub 로그인 서버에서 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
  }
  return `로그인에 실패했어요: ${raw}`;
}

function SignupForm() {
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
    hardNavigate('/', {
      flash: { type: 'success', message: '로그인 없이 계속합니다. 기록은 이 브라우저에만 저장돼요.' },
    });
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
      // 메일 인증 링크 → /auth/callback 에서 user_news_reads 로 마이그레이션할 수 있도록
      // 마지막으로 본 새소식 id 를 짧은 쿠키로 옮겨둔다.
      stashGuestNewsLastSeenInCookie();
      // 전체 이동으로 입력했던 비밀번호가 보존된 폼(Activity)에 남지 않게 한다
      hardNavigate('/login', {
        flash: {
          type: 'success',
          message: `${email}로 인증 메일을 발송했습니다. 메일의 링크를 눌러 인증을 완료한 뒤 로그인해주세요.`,
          duration: 6000,
        },
      });
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  // SSR에서는 지원 여부를 알 수 없어 null로 시작 — 버튼은 항상 렌더링하고 mount 후 boolean으로 확정.
  // 이렇게 하면 버튼이 "안 보였다가 갑자기 나타나는" 깜빡임이 사라진다.
  const passkeySupported = useWebAuthnSupported();
  const [passkeyInFlight, setPasskeyInFlight] = useState(false);
  const autofillStarted = useRef(false);

  // 이메일 필드 확장 & 브라우저가 conditional UI 지원 시 autofill 시작
  useEffect(() => {
    if (!emailExpanded) return;
    if (autofillStarted.current) return;
    let cancelled = false;
    let ceremonyStarted = false;
    (async () => {
      if (!(await isConditionalUISupported())) return;
      if (cancelled) return;
      autofillStarted.current = true;
      ceremonyStarted = true;
      try {
        await loginWithPasskey({ useAutofill: true });
        // 여기까지 왔으면 세션은 이미 발급됐다 — 그 사이 화면이 숨겨졌더라도 로그인 마무리(이동)는 끝까지 진행한다.
        disableGuestMode();
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user?.id) {
          await migrateGuestNewsLastSeen(supabase, userData.user.id);
        }
        hardNavigate('/', { flash: { type: 'success', message: '패스키로 로그인되었습니다.' } });
      } catch {
        // 사용자 취소/autofill 비활성 — 조용히 무시
      }
    })();
    return () => {
      cancelled = true;
      // 페이지가 Activity 로 숨겨지면 대기 중인 conditional UI 요청을 정리하고, 다시 보일 때
      // 새 ceremony 를 시작하도록 플래그를 되돌린다. (남겨두면 숨김 동안 pending 이던 옛 요청이
      // 재방문 후에 resolve 돼 화면 갱신 없이 세션만 발급될 수 있다)
      if (ceremonyStarted) {
        WebAuthnAbortService.cancelCeremony();
        autofillStarted.current = false;
      }
    };
  }, [emailExpanded]);

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
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        await migrateGuestNewsLastSeen(supabase, userData.user.id);
      }
      hardNavigate('/', { flash: { type: 'success', message: '패스키로 로그인되었습니다.' } });
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }
      disableGuestMode();
      if (data.user?.id) {
        await migrateGuestNewsLastSeen(supabase, data.user.id);
      }
      hardNavigate('/', { flash: { type: 'success', message: '로그인되었습니다.' } });
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
    hardNavigate('/', {
      flash: { type: 'success', message: '로그인 없이 계속합니다. 기록은 이 브라우저에만 저장돼요.' },
    });
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
      <div className="w-full max-w-sm">
        <header className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
            <ClipboardList size={22} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
            일일 업무 보고 생성기
          </h1>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            프로젝트별 진행률을 적으면 보고서 양식이 자동으로 만들어져요.
          </p>
        </header>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{title}</h2>
            {/* 로그인은 첫 화면이 아닌 선택 단계 — 작성 화면으로 돌아가는 닫기 버튼을 항상 노출한다.
                '/' 는 prefix 관계로 nav-back 이 자동 추론되어 복귀 슬라이드로 전환된다. */}
            <Link href="/" aria-label="닫고 작성 화면으로 돌아가기" className={closeButtonClassName('md', '-m-2')}>
              <CloseIcon />
            </Link>
          </div>
          {children}
        </div>
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
// 게스트가 서비스의 기본 진입 상태이므로 "로그인 없이 계속하기"로 표현한다.
function GuestSection({ onStart }: Readonly<GuestSectionProps>) {
  return (
    <>
      <Divider />
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        로그인 없이 계속하기
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
  // 로그인 ↔ 회원가입을 오가면 두 페이지가 Activity 로 함께 DOM 에 남으므로, DOM id 는 인스턴스마다 고유하게 만든다.
  // (고정 id 면 label 이 숨겨진 쪽 input 을 가리키거나 비밀번호 관리자 autofill 이 혼동된다) `id` 는 name 으로만 쓴다.
  const inputId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
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
