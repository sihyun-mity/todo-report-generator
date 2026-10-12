import { SERVICE_WORKER_PATH } from '@/constants';

// 브라우저 측 Web Push 헬퍼. 'use client' 컴포넌트에서만 호출한다.

/** 이 브라우저가 Service Worker + Push 를 지원하는지. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
}

/** iOS 여부 (Safari 는 홈 화면에 추가한 PWA 에서만 푸시 지원). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** 홈 화면에 설치된(standalone) 상태인지. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

// VAPID 공개키(base64url)를 pushManager.subscribe 가 요구하는 Uint8Array 로 변환.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/', updateViaCache: 'none' });
}

/** 이 기기의 현재 구독을 반환 (없으면 null). 토글 상태 표시에 사용. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
}

/**
 * 권한 요청 → 구독 → 서버 저장. 성공 시 PushSubscription 반환.
 * 권한 거부 시 'denied', 미지원 시 'unsupported' 를 throw 한다.
 */
export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error('unsupported');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error('VAPID 공개키가 설정되지 않았습니다.');

  const registration = await getRegistration();
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? '구독 저장에 실패했습니다.');
  }

  return subscription;
}

/** 이 기기의 구독 해제 + 서버 삭제. */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  const endpoint = subscription?.endpoint;

  await subscription?.unsubscribe();

  if (endpoint) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  }
}
