const CACHE_PREFIX = "moadbook-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_ROOT = new URL("./", self.registration.scope).href;
const SCOPE_PATH = new URL("./", self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(new Request(APP_ROOT, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
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
        .then((response) => (response.ok ? response : caches.match(APP_ROOT)))
        .catch(() => caches.match(APP_ROOT))
        .then((response) => response ?? Response.error()),
    );
    return;
  }

  const isAppAsset =
    url.pathname.startsWith(`${SCOPE_PATH}_expo/static/`) ||
    url.pathname === `${SCOPE_PATH}icon.png` ||
    url.pathname === `${SCOPE_PATH}manifest.webmanifest`;
  if (!isAppAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = fetch(request).then(async (response) => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      });

      if (cached) {
        void update.catch(() => undefined);
        return cached;
      }

      try {
        return await update;
      } catch {
        return Response.error();
      }
    })(),
  );
});
