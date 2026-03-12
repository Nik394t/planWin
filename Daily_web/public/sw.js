function iconUrl() {
  return new URL('icon-192.png', self.registration.scope).toString();
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SHOW_NOTIFICATION') {
    return;
  }
  const payload = event.data.payload || {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Daily', {
      body: payload.body || '',
      icon: iconUrl(),
      badge: iconUrl(),
      tag: payload.tag,
      data: payload.data || {},
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Daily', body: event.data?.text() || '' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Daily', {
      body: payload.body || '',
      icon: iconUrl(),
      badge: iconUrl(),
      tag: payload.tag,
      data: payload.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
