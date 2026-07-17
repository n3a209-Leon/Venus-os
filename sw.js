// ═══════════════════════════════════════════════════════
// sw.js — 作業記錄 PWA Service Worker
// 策略：Cache First（離線優先）
// 每次 App 更新時修改 CACHE_VERSION 讓舊快取失效
// ═══════════════════════════════════════════════════════

const CACHE_VERSION = 'hw-tracker-v6';
const CACHE_NAME = CACHE_VERSION;

// 需要快取的資源（App 本體）
const PRECACHE_URLS = [
  './',
  './index.html',
];

// ── Install：預快取 App 本體 ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      // 強制跳過等待，立即生效
      return self.skipWaiting();
    })
  );
});

// ── Activate：清除舊版快取 ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      // 立即接管所有頁面
      return self.clients.claim();
    })
  );
});

// ── Fetch：攔截請求 ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Firebase / Google API 請求：永遠走網路，不快取
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    // 網路優先，失敗就讓它失敗（Firebase 自己有離線處理）
    event.respondWith(fetch(event.request).catch(function() {
      return new Response('', { status: 503 });
    }));
    return;
  }

  // App 本體：Cache First → 有快取直接用，沒有再去網路抓
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // 背景更新：有快取直接回傳，同時偷偷去網路更新快取
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var responseToCache = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(function() {});
        // 回傳快取版本（不等背景更新）
        return cached;
      }
      // 沒有快取 → 去網路抓，並存入快取
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
