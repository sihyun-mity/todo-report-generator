import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // RLS로 본인 행만 반환됨. public_key/counter는 의도적으로 제외.
  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select('id, device_name, transports, aaguid, device_type, backed_up, created_at, last_used_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ passkeys: data ?? [] });
}
