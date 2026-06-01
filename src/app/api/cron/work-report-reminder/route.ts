import { NextResponse, type NextRequest } from 'next/server';
import {
  WORK_REPORT_REMINDER_BODY,
  WORK_REPORT_REMINDER_TAG,
  WORK_REPORT_REMINDER_TITLE,
  WORK_REPORT_REMINDER_URL,
} from '@/constants';
import { isKoreanHoliday } from '@/lib/holidays/kr-holidays';
import { sendPush, type StoredSubscription } from '@/lib/push/web-push';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
// 외부 API(공휴일) + 다건 푸시 — 충분한 실행 시간 확보
export const maxDuration = 60;

// KST 기준 오늘 날짜 키('YYYY-MM-DD'). 클라이언트가 로컬시간으로 저장하는 report_date 와 동일 형식.
function kstTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// dateKey 의 요일(0=일 ~ 6=토)을 KST 기준으로 계산.
function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00+09:00`).getUTCDay();
}

type SubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function GET(request: NextRequest) {
  // Vercel Cron 은 CRON_SECRET 설정 시 Authorization: Bearer <secret> 를 붙여 호출한다.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = kstTodayKey();

  // 주말(크론 스케줄로도 평일만 호출되지만 방어적으로) 또는 공휴일이면 발송하지 않는다.
  const day = weekdayOf(today);
  if (day === 0 || day === 6) {
    return NextResponse.json({ skipped: 'weekend', today });
  }

  const supabase = createAdminClient();

  let isHoliday = false;
  try {
    isHoliday = await isKoreanHoliday(supabase, today);
  } catch (error) {
    // 공휴일 판정 실패 시: 알림이 실제로 휴일에 잘못 가는 것을 막기 위해 발송을 보류한다.
    console.error('공휴일 판정 실패 — 발송 보류', error);
    return NextResponse.json({ error: 'holiday-check-failed', today }, { status: 502 });
  }
  if (isHoliday) {
    return NextResponse.json({ skipped: 'holiday', today });
  }

  // 1) 구독이 있는 사용자(= 알림 ON) 전체
  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .returns<Array<SubscriptionRow>>();
  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ today, sent: 0, targets: 0 });
  }

  // 2) 오늘 이미 작성한 사용자 제외
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const { data: written, error: writtenError } = await supabase
    .from('reports')
    .select('user_id')
    .eq('report_date', today)
    .in('user_id', userIds)
    .returns<Array<{ user_id: string }>>();
  if (writtenError) {
    return NextResponse.json({ error: writtenError.message }, { status: 500 });
  }
  const writtenSet = new Set((written ?? []).map((r) => r.user_id));

  const targets = subs.filter((s) => !writtenSet.has(s.user_id));

  // 3) 발송
  const payload = {
    title: WORK_REPORT_REMINDER_TITLE,
    body: WORK_REPORT_REMINDER_BODY,
    url: WORK_REPORT_REMINDER_URL,
    tag: WORK_REPORT_REMINDER_TAG,
  };

  const results = await Promise.all(
    targets.map(async (sub) => {
      const stored: StoredSubscription = { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth };
      const { expired } = await sendPush(stored, payload);
      return { endpoint: sub.endpoint, expired };
    })
  );

  // 4) 만료된 구독 정리
  const expiredEndpoints = results.filter((r) => r.expired).map((r) => r.endpoint);
  if (expiredEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }

  const sent = results.filter((r) => !r.expired).length;
  return NextResponse.json({ today, targets: targets.length, sent, cleaned: expiredEndpoints.length });
}
