// Çevrimdışı çalışma: uygulama dosyalarını önbelleğe al.
const VERSION = 'rastgele-v71';
const TILES = 'tiles2'; // eski 'tiles' önbelleği (sınırsız büyüyordu) silinir
const TILE_MAX = 1500;
const CORE = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/db.js', 'js/data.js', 'js/weather.js', 'js/fishscore.js', 'js/species-model.js', 'js/timeline.js', 'js/guide.js', 'js/knots.js', 'js/group.js', 'js/config.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// Dosyaları tek tek önbelleğe al: biri (ör. dış kaynak) inmezse kurulum yine de tamamlansın.
// (Önceden tek bir hata kurulumu bozuyor, site "yüklenebilir" sayılmıyordu.)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Hava API'si: her zaman ağdan (uygulama kendi önbelleğini tutuyor)
  if (url.hostname.includes('open-meteo.com')) return;

  // Harita karoları: önce önbellek, sonra ağ (gezilen yerler çevrimdışı da görünür).
  // Yalnız başarılı yanıtlar saklanır; en fazla TILE_MAX karo (en eskiler silinir) — telefon dolmasın.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone()).then(() => trimTiles(c)).catch(() => {});
      return res;
    }));
    return;
  }

  // Uygulama dosyaları: önce ağ (tarayıcının eski kopyasını değil sunucuyu sor: eski/yeni dosya karışmasın),
  // zayıf bağlantıda 4 sn içinde gelmezse kayıtlı sürüm açılır.
  const same = url.origin === location.origin;
  const net = (same ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request)).then(res => {
    if (res.ok && (same || url.hostname === 'cdnjs.cloudflare.com')) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
    }
    return res;
  });
  const cached = () => caches.match(e.request, { ignoreSearch: true }).then(r => r
    // Sayfa yedeği yalnız sayfa açılışında; betik/stil yerine sayfa vermek hataya yol açar
    || (e.request.mode === 'navigate' ? caches.match('index.html') : null));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => cached().then(finish), 4000);
    net.then(r => { clearTimeout(t); finish(r); })
      .catch(() => { clearTimeout(t); cached().then(r => { finish(r); if (!done) { done = true; resolve(Response.error()); } }); });
  }));
});

let trimming = false;
async function trimTiles(c) {
  if (trimming) return;
  trimming = true;
  try { const keys = await c.keys(); if (keys.length > TILE_MAX) for (const k of keys.slice(0, keys.length - TILE_MAX)) await c.delete(k); }
  finally { trimming = false; }
}
