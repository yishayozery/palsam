const CACHE_NAME = "palmy-v1";
const PRECACHE = ["/offline"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Static assets — cache first
  if (url.pathname.match(/\.(js|css|png|jpg|svg|woff2?|ico)$/)) {
    e.respondWith(
      caches.open(CACHE_NAME).then((c) =>
        c.match(e.request).then((cached) =>
          cached || fetch(e.request).then((res) => {
            if (res.ok) c.put(e.request, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  // HTML pages — network first, fallback to offline page
  if (e.request.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/offline").then((r) => r || new Response("אופליין", { status: 503 })))
    );
    return;
  }
});
