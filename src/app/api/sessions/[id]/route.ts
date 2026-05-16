import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 본인 소유의 특정 세션(기기)을 로그아웃
export async function DELETE(_request: Request, { params }: RouteContext<'/api/sessions/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // revoke_user_session: 본인 소유 여부 검증 + 현재 세션 차단을 RPC 내부에서 수행
  const { data, error } = await supabase.rpc('revoke_user_session', { target_session_id: id });
  if (error) {
    const message = /current session/.test(error.message)
      ? '현재 사용 중인 기기는 이 화면에서 로그아웃할 수 없습니다.'
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: '해당 세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}
