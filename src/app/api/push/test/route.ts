import { NextResponse } from 'next/server';
import { WORK_REPORT_REMINDER_TAG, WORK_REPORT_REMINDER_URL } from '@/constants';
import { sendPush, type StoredSubscription } from '@/lib/push/web-push';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 현재 로그인 사용자의 모든 기기로 테스트 알림 발송 — 설정이 제대로 됐는지 확인용.
export async function POST() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .returns<Array<StoredSubscription>>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: '등록된 구독이 없습니다.' }, { status: 400 });
  }

  const payload = {
    title: '테스트 알림',
    body: '알림이 정상적으로 도착했어요. 평일 오후 4시에 작성 알림을 받게 됩니다.',
    url: WORK_REPORT_REMINDER_URL,
    tag: WORK_REPORT_REMINDER_TAG,
  };

  const results = await Promise.all(subs.map((sub) => sendPush(sub, payload)));
  const sent = results.filter((r) => !r.expired).length;

  return NextResponse.json({ sent });
}
