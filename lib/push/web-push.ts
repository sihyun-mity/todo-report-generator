import 'server-only';
import webpush, { type PushSubscription, type WebPushError } from 'web-push';

// VAPID 설정은 모듈 1회 초기화. 키가 없으면 명시적으로 알린다.
let configured = false;

function ensureConfigured() {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID 환경변수가 없습니다 (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
};

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const toWebPushSubscription = (sub: StoredSubscription): PushSubscription => ({
  endpoint: sub.endpoint,
  keys: { p256dh: sub.p256dh, auth: sub.auth },
});

/**
 * 단건 발송. 구독이 만료(404/410)되었으면 true 를 반환해 호출자가 행을 정리하도록 한다.
 * 일시적 오류는 false 를 반환하고 로그만 남긴다.
 */
export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<{ expired: boolean }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(toWebPushSubscription(sub), JSON.stringify(payload));
    return { expired: false };
  } catch (error) {
    const statusCode = (error as WebPushError)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { expired: true };
    }
    console.error('푸시 발송 실패', sub.endpoint, statusCode, error);
    return { expired: false };
  }
}
