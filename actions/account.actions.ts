'use server';

import { WITHDRAW_CONFIRM_PHRASE } from '@/constants';
import { clearGithubToken } from '@/lib/github/token-cookie';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { WithdrawAccountResult } from '@/types';

/**
 * 회원 탈퇴 — 현재 로그인한 회원의 계정(`auth.users`)을 지운다.
 *
 * 회원 행을 담는 테이블은 모두 `auth.users(id) on delete cascade` 라 계정과 함께 지워진다
 * (보고서 기록·커밋 가져오기 메모리·패스키·작성 알림 구독·새소식 읽음 기록·로그인 세션).
 * 계정 삭제는 service role 만 할 수 있어 admin 클라이언트를 쓰되, 대상은 세션으로 확인한 본인 id 로만 정한다.
 */
export async function withdrawAccount(confirmPhrase: string): Promise<WithdrawAccountResult> {
  if (confirmPhrase.trim() !== WITHDRAW_CONFIRM_PHRASE) return { ok: false, reason: 'invalid_confirm' };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { ok: false, reason: 'members_only' };
    userId = data.user.id;
  } catch {
    // 게스트·stale 토큰은 getUser() 가 던질 수 있어 비회원으로 본다
    return { ok: false, reason: 'members_only' };
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    console.error('[account] 회원 탈퇴 실패', error.message);
    return { ok: false, reason: 'failed' };
  }

  // 계정이 사라졌으니 이 브라우저의 세션·GitHub 토큰 쿠키도 지운다.
  // 서버 쪽 세션은 이미 계정과 함께 지워져 signOut 의 원격 호출이 실패할 수 있으나 쿠키 정리는 그대로 이뤄진다.
  await clearGithubToken();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // 쿠키 정리 실패는 무시 — 다음 요청에서 사라진 계정의 토큰은 비로그인으로 처리된다
  }

  return { ok: true };
}
