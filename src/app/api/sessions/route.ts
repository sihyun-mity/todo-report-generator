import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 현재 로그인 사용자의 활성 세션(기기) 목록
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // list_user_sessions: SECURITY DEFINER RPC. auth.uid()/JWT로 본인 세션만 반환.
  const { data, error } = await supabase.rpc('list_user_sessions');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}

// 현재 사용 중인 세션을 제외한 다른 모든 기기를 로그아웃
export async function DELETE() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('revoke_other_user_sessions');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ revoked: typeof data === 'number' ? data : 0 });
}
