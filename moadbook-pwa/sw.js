const CACHE_PREFIX = "moadbook-pwa-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const APP_ROOT = new URL("./", self.registration.scope);
const SCOPE_PATH = APP_ROOT.pathname;
const SHELL_URLS = [
  APP_ROOT.href,
  new URL("./index.html", APP_ROOT).href,
  new URL("./manifest.webmanifest", APP_ROOT).href,
  new URL("./moadbook-icon.png", APP_ROOT).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || key === "moadbook-shell-v1")
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response.ok ? response : caches.match(new URL("./index.html", APP_ROOT).href))
        .catch(() => caches.match(new URL("./index.html", APP_ROOT).href))
        .then((response) => response ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : { body: event.data?.text?.() || "" };
  } catch {
    data = { body: event.data?.text?.() || "" };
  }

  const icon = new URL("./moadbook-icon.png", APP_ROOT).href;
  const title = String(data.title || "moadbook").slice(0, 100);
  const options = {
    body: String(data.body || "لديك إشعار جديد").slice(0, 220),
    icon,
    badge: icon,
    tag: String(data.tag || "moadbook-notification"),
    data: { url: String(data.url || "./index.html?open=notifications") },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const fallback = new URL("./index.html?open=notifications", APP_ROOT);
  let target;
  try {
    target = new URL(event.notification.data?.url || fallback.href, APP_ROOT);
    if (target.origin !== self.location.origin || !target.pathname.startsWith(SCOPE_PATH)) target = fallback;
  } catch {
    target = fallback;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith(SCOPE_PATH)) {
          if ("navigate" in client) void client.navigate(target.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
