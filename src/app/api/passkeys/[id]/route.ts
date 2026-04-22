import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

interface PatchBody {
  device_name?: string;
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 });
  }

  const next = typeof body.device_name === 'string' ? body.device_name.trim() : null;
  // 공백만 들어오면 null로 저장 (= 라벨 제거)
  const payload = { device_name: next && next.length > 0 ? next : null };

  // RLS로 본인 행만 update됨. trigger가 device_name 외 컬럼 변경을 차단.
  const { data, error } = await supabase
    .from('webauthn_credentials')
    .update(payload)
    .eq('id', id)
    .select('id, device_name')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '해당 패스키를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // RLS가 본인 여부 검증
  const { error, count } = await supabase.from('webauthn_credentials').delete({ count: 'exact' }).eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (count === 0) {
    return NextResponse.json({ error: '해당 패스키를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
