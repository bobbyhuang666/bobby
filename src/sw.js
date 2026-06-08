/**
 * Bobby Service Worker
 *
 * 策略：
 * - 页面导航 → Network First（确保始终拿到最新 HTML）
 * - 静态资源（CSS/JS/字体/图片）→ Cache First（离线也能用）
 * - API 请求 → Network Only（不缓存，保证数据实时性）
 */

const CACHE_NAME = 'bobby-v1';
const STATIC_ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  '/bobbyDefaults.js',
  '/images/avatar.svg',
  '/images/ai-avatar.svg',
  '/images/icon-192.svg',
  '/images/icon-512.svg',
  '/manifest.json',
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API 请求：直接走网络，不缓存
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Google Fonts：Cache First（字体几乎不变）
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // 静态资源：Stale-While-Revalidate（立即返回缓存，后台更新缓存）
  // 避免部署后旧 JS/CSS 不更新的问题
  if (request.destination === 'style' || request.destination === 'script' ||
      request.destination === 'image' || request.destination === 'font' ||
      request.destination === 'manifest') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        }).catch(() => cached); // 网络失败时降级到缓存

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 页面导航：Network First（离线时返回缓存的 index.html）
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match('/'))
  );
});
