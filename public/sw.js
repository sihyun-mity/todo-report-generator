// 일일 업무 보고 생성기 — Web Push Service Worker.
// 푸시 수신 시 알림을 표시하고, 클릭 시 작성 페이지를 연다(이미 열린 탭이 있으면 focus).

self.addEventListener('install', () => {
  // 새 SW 를 즉시 활성화 — 사용자가 새로고침할 때까지 기다리지 않는다.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 활성화 즉시 열려 있는 모든 클라이언트를 이 SW 가 제어하도록 한다.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '알림', body: event.data.text() };
  }

  const title = payload.title || '알림';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열린 동일 오리진 탭이 있으면 focus 하고 해당 URL 로 이동
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && 'focus' in client) {
          client.focus();
          if ('navigate' in client && url.pathname !== targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // 없으면 새 창으로 연다
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
