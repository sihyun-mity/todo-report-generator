import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PasskeySessionTokens } from '@/types';

/**
 * 패스키 검증 성공 후 Supabase 세션을 발급하기 위한 브리지.
 *
 * `admin.auth.admin.generateLink({ type: 'magiclink', email })`로 `hashed_token`을 얻고,
 * 이 값을 클라이언트에게 돌려주면 클라이언트가 `supabase.auth.verifyOtp({ type: 'email', token_hash })`로
 * 세션 쿠키를 세팅한다.
 *
 * Supabase JS SDK는 임의 유저로 세션을 생성하는 공식 API가 없어 이 우회로를 쓴다.
 */
export async function issuePasskeyLoginTokens(email: string): Promise<PasskeySessionTokens> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error) {
    throw new Error(`세션 토큰 발급 실패: ${error.message}`);
  }

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error('세션 토큰 발급 실패: hashed_token 없음');
  }

  return { email, tokenHash };
}
