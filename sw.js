const CACHE = "scan-go-v1";
const LOCAL_ASSETS = [
  "./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png"
];
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
  "https://docs.opencv.org/4.x/opencv.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(LOCAL_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && (u.origin === location.origin || CDN_ASSETS.includes(e.request.url))) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
