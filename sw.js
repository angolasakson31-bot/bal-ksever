// Çevrimdışı çalışma: uygulama dosyalarını önbelleğe al.
const VERSION = 'rastgele-v1';
const CORE = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/db.js', 'js/data.js', 'js/weather.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'tiles').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Hava API'si: her zaman ağdan (uygulama kendi önbelleğini tutuyor)
  if (url.hostname.includes('open-meteo.com')) return;

  // Harita karoları: önce önbellek, sonra ağ (gezilen yerler çevrimdışı da görünür)
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open('tiles').then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // Uygulama dosyaları: önce ağ (güncel sürüm), olmazsa önbellek
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com')) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
