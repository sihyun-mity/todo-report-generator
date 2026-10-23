'use server';

import { ACCOUNT_DATA_KIND, ACCOUNT_DATA_KIND_VALUES } from '@/enums';
import { createClient } from '@/lib/supabase/server';
import type { AccountDataKind, AccountDataSummary, AccountDataSummaryResult, DeleteAccountDataResult } from '@/types';

// 종류별 테이블. 모두 `user_id` 로 본인 행을 가르고, 본인 행 삭제를 RLS 가 허용한다.
const TABLES: Record<AccountDataKind, string> = {
  [ACCOUNT_DATA_KIND.REPORTS]: 'reports',
  [ACCOUNT_DATA_KIND.COMMIT_IMPORT_MEMORY]: 'commit_import_memories',
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// 회원 전용. 게스트·stale 토큰은 getUser() 가 던질 수 있어 비회원으로 본다.
async function getMember(): Promise<{ supabase: Supabase; userId: string } | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { supabase, userId: data.user.id } : null;
  } catch {
    return null;
  }
}

async function countRows(supabase: Supabase, kind: AccountDataKind, userId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(TABLES[kind])
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return error ? null : (count ?? 0);
}

/** 종류별로 이 회원의 데이터가 서버에 몇 행 남아 있는지 */
export async function getAccountDataSummary(): Promise<AccountDataSummaryResult> {
  const member = await getMember();
  if (!member) return { ok: false, reason: 'members_only' };

  const counts = await Promise.all(
    ACCOUNT_DATA_KIND_VALUES.map((kind) => countRows(member.supabase, kind, member.userId))
  );
  const summary = Object.fromEntries(
    ACCOUNT_DATA_KIND_VALUES.map((kind, i) => [kind, counts[i]])
  ) as AccountDataSummary;
  return { ok: true, summary };
}

/**
 * 고른 종류의 데이터를 이 회원 것만 지운다(RLS 적용 클라이언트 — 다른 회원 행은 애초에 보이지 않는다).
 *
 * RLS 가 삭제를 막으면 오류 없이 0행만 지워지므로, 지운 뒤 다시 세어 남은 행이 있으면 실패로 본다.
 */
export async function deleteAccountData(kinds: ReadonlyArray<AccountDataKind>): Promise<DeleteAccountDataResult> {
  const targets = [...new Set(kinds)].filter((kind): kind is AccountDataKind =>
    (ACCOUNT_DATA_KIND_VALUES as ReadonlyArray<string>).includes(kind)
  );
  if (targets.length === 0) return { ok: false, reason: 'invalid_request' };

  const member = await getMember();
  if (!member) return { ok: false, reason: 'members_only' };
  const { supabase, userId } = member;

  const results = await Promise.all(
    targets.map(async (kind) => {
      const { error } = await supabase.from(TABLES[kind]).delete().eq('user_id', userId);
      if (error) {
        console.error(`[account-data] ${kind} 삭제 실패`, error.message);
        return false;
      }
      return (await countRows(supabase, kind, userId)) === 0;
    })
  );

  const deleted = targets.filter((_, i) => results[i]);
  const failed = targets.filter((_, i) => !results[i]);
  return failed.length === 0 ? { ok: true, deleted } : { ok: false, reason: 'partial_failure', deleted, failed };
}
