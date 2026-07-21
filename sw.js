/* ============================================================
 * Venus OS · Service Worker（PWA 離線支援）
 * 搭配 index.html（單一 HTML，React 17 + Firebase compat 全部內嵌）
 *
 * ★ 每次部署務必把 CACHE 版本號 +1（v4 → v5 …），
 *   否則使用者端會吃到舊快取、第一次開啟看不到新功能。
 *   （這不是部署失敗，只是快取沒換版）
 * ============================================================ */

const CACHE = 'venus-os-v4';

/* 需預先快取的 App Shell（同源）。
 * 整個 App 內嵌於 index.html，快取這兩個即可完整離線啟動。 */
const SHELL = ['./', './index.html'];

/* 版本固定、內容不變、可安全快取的「跨網域靜態資源」主機
 * （Firebase compat SDK 帶版本號 10.12.0；Google Fonts）。
 * 快取後即可離線啟動。 */
const STATIC_HOSTS = [
  'www.gstatic.com',       // Firebase compat SDK（app / auth / firestore）
  'fonts.googleapis.com',  // Google Fonts CSS
  'fonts.gstatic.com'      // Google Fonts 字型檔
];

/* 絕不可快取的「動態 API」主機（Firestore 同步、Firebase 登入）。
 * 一律直接走網路；離線就讓它失敗，交由 App 自身的離線處理。
 * ★ 若把這些快取起來，會回放過期資料 → 造成同步/登入錯亂。 */
const BYPASS_HOSTS = [
  'firestore.googleapis.com',           // Firestore 讀寫 / Listen 長連線
  'identitytoolkit.googleapis.com',     // Firebase Auth
  'securetoken.googleapis.com',         // Auth token refresh
  'firebaseinstallations.googleapis.com',
  'firebaselogging.googleapis.com',
  'www.googleapis.com'                  // 其他 Google API
];

/* ── 安裝：預先快取 App Shell ──
 * 只 addAll 同源檔案：任何一個失敗會整個 install 失敗，
 * 所以跨網域資源改在執行期（fetch）才懶快取，避免離線安裝時卡住。 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())   // 立即接手，配合 index.html 的「重新載入」提示
      .catch(() => self.skipWaiting())  // 預快取失敗也不擋安裝（線上仍可從網路取）
  );
});

/* ── 啟用：清掉所有舊版快取，只留當前 CACHE ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── 選配：支援前端主動觸發跳過等待（目前 index.html 未使用，保留無害）── */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ── 攔截請求 ── */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 只處理 GET；POST/PUT 等（多為寫入型 API）一律放行
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 只處理 http/https（略過 chrome-extension: 等）
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1) Firebase / Google 動態 API：完全不攔截，直接走網路（不快取、不退回）
  if (BYPASS_HOSTS.indexOf(url.hostname) > -1) return;

  // 2) 導覽請求（開啟 App / 重新整理）：網路優先，離線退回快取的 index.html
  //    → 線上時一定拿到 Netlify 上的最新版，離線時仍能開啟。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 3) 版本固定的跨網域靜態資源（Firebase SDK、字型）：快取優先＋背景更新（SWR）
  if (STATIC_HOSTS.indexOf(url.hostname) > -1) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          // opaque（無 CORS）或正常回應都存起來
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || network;   // 有快取先給、同時背景更新；沒快取才等網路
      })
    );
    return;
  }

  // 4) 其餘同源資源：快取優先，退回網路，最後退回 index.html
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // 5) 其他未列名的跨網域資源：直接走網路，不快取
});
