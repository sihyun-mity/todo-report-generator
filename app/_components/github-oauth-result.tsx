'use client';

import { useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import type { GithubCaptureResult } from '@/types';
import { captureGithubImportToken } from '@/actions';
import { GITHUB_IMPORT_INTENT_COOKIE, GITHUB_OAUTH_RESULT_PARAM } from '@/constants';
import { useSignalEffect } from '@/hooks';
import { createClient } from '@/lib/supabase/client';

type GithubOAuthResultProps = {
  onConnected: () => void;
};

const CAPTURE_FAILURE_MESSAGES: Record<Exclude<GithubCaptureResult, 'connected' | 'no_intent'>, string> = {
  members_only: '로그인한 회원만 GitHub를 연결할 수 있어요.',
  account_mismatch: '연결을 시작한 계정과 다른 계정으로 로그인됐어요. 다시 시도해 주세요.',
  missing_token: 'GitHub 토큰을 받지 못했어요. 다시 연결해 주세요.',
  missing_scope: 'GitHub 저장소 읽기 권한(repo)이 승인되지 않았어요. 다시 연결해 주세요.',
  github_error: 'GitHub 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

const hasImportIntentCookie = () =>
  document.cookie.split('; ').some((c) => c.startsWith(`${GITHUB_IMPORT_INTENT_COOKIE}=`));

// 처리한 OAuth 흔적을 URL 에서 지운다 (router.replace 는 RSC 재요청을 일으켜 history API 사용)
const cleanUrl = (keys: ReadonlyArray<string>) => {
  const cleaned = new URL(window.location.href);
  keys.forEach((key) => cleaned.searchParams.delete(key));
  window.history.replaceState(window.history.state, '', `${cleaned.pathname}${cleaned.search}${cleaned.hash}`);
};

// GitHub 연결 복귀를 처리한다. 연결되면 가져오기 다이얼로그를 다시 연다.
// 1) `/auth/callback` 을 거친 경우: `?github=connected|denied|error` 결과를 토스트로 알린다.
// 2) Supabase 가 Site URL(`/?code=...`)로 돌려보내 콜백을 건너뛴 경우: 의도 쿠키가 남아 있으므로
//    브라우저 클라이언트의 코드 교환이 끝나길 기다렸다가 서버 액션이 세션의 provider token 을 받아 둔다.
// 요청 시점에만 알 수 있는 search param 읽기를 이 컴포넌트로 격리해 호출부에서 <Suspense> 로 감싼다.
export function GithubOAuthResult({ onConnected }: Readonly<GithubOAuthResultProps>) {
  const result = useSearchParams().get(GITHUB_OAUTH_RESULT_PARAM);

  useSignalEffect(result, () => {
    if (result === 'connected') {
      toast.success('GitHub 계정을 연결했습니다.');
      onConnected();
    } else if (result === 'denied') {
      toast.error('GitHub 연결을 취소했습니다.');
    } else {
      toast.error('GitHub 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    cleanUrl([GITHUB_OAUTH_RESULT_PARAM]);
  });

  const onCaptured = useEffectEvent((captured: GithubCaptureResult) => {
    if (captured === 'no_intent') return;
    cleanUrl(['code']);
    if (captured === 'connected') {
      toast.success('GitHub 계정을 연결했습니다.');
      onConnected();
    } else {
      toast.error(CAPTURE_FAILURE_MESSAGES[captured]);
    }
  });

  // 의도 쿠키는 서버 액션이 읽는 즉시 지우므로, 숨김 후 재실행되어도 한 번만 처리된다.
  useEffect(() => {
    if (!hasImportIntentCookie()) return;
    let cancelled = false;
    void (async () => {
      // getSession 은 브라우저 클라이언트 초기화(URL 의 code 교환 포함)가 끝난 뒤 돌아온다
      await createClient().auth.getSession();
      const captured = await captureGithubImportToken();
      if (!cancelled) onCaptured(captured);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
