// Hava ve deniz verisi: Open-Meteo (ücretsiz, anahtarsız, saatlik güncellenir).
// "best_match" modu, konuma göre en iyi sayısal hava modellerini (ECMWF, DWD ICON, Météo-France vb.)
// otomatik seçip birleştirir. Uygulamanın güncellenmesi gerekmez; veriler her açılışta ve
// 10 dakikada bir yeniden çekilir.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
export const TTL = 10 * 60000; // 10 dakika
const memCache = new Map();
const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation,precipitation_probability,cloud_cover,weather_code,is_day';
const M15 = 'temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day';

// İstek: ağ hatası, zaman aşımı, 429 (çok istek) ve 5xx'te birkaç saniye arayla tekrar dene
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url, tries = 3) {
  let lastErr;
  for (let t = 0; t < tries; t++) {
    if (t) await sleep(t === 1 ? 1500 : 4000);
    let res;
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = ctl && setTimeout(() => ctl.abort(), 20000);
      res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      clearTimeout(to);
    } catch { lastErr = new Error('İnternet bağlantısı yok veya hava servisine ulaşılamadı.'); continue; }
    const body = await res.json().catch(() => null);
    if (res.ok && body && !body.error) return body;
    lastErr = new Error(`Hava servisi hatası (${res.status}): ${body?.reason || 'bilinmeyen'}`);
    if (res.status !== 429 && res.status < 500) break; // hatalı istek: tekrar denemenin anlamı yok
  }
  throw lastErr;
}

// ——— Geçici hava kaydı (telefonda) ———
// Yalnızca hava verisi; meralar/avlar burada değil (onlar veritabanında, hiç silinmez).
// Küçük kayıt alanı (~5 MB) dolmasın diye en yeni 40 nokta tutulur, eskiler silinir.
const WX_MAX = 40;
function wxIndex() { try { return JSON.parse(localStorage.getItem('wx2idx') || '{}'); } catch { return {}; } }
function wxSave(k, data) {
  const idx = wxIndex();
  idx[k] = data.fetchedAt;
  const drop = Object.keys(idx).sort((a, b) => idx[b] - idx[a]).slice(WX_MAX);
  for (const d of drop) { delete idx[d]; try { localStorage.removeItem('wx2:' + d); } catch { /* yok */ } }
  const write = () => { localStorage.setItem('wx2:' + k, JSON.stringify(data)); localStorage.setItem('wx2idx', JSON.stringify(idx)); };
  try { write(); } catch {
    // Yine de yer yoksa en eski yarısını sil ve bir kez daha dene
    const old = Object.keys(idx).filter(x => x !== k).sort((a, b) => idx[a] - idx[b]);
    for (const d of old.slice(0, Math.ceil(old.length / 2))) { delete idx[d]; try { localStorage.removeItem('wx2:' + d); } catch { /* yok */ } }
    try { write(); } catch { /* vazgeç: hava verisi zaten yeniden indirilir */ }
  }
}
// Eski sürümden kalan, dizinde olmayan hava kayıtlarını temizle (bir kez)
try {
  const idx = wxIndex();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wx2:') && !(k.slice(4) in idx)) localStorage.removeItem(k);
  }
} catch { /* yok */ }

const key = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

const hasWaves = m => !!m?.hourly?.wave_height?.some(v => v != null);

// Deniz verisi: önce best_match + tüm değişkenler, olmazsa daha basit istekler
async function fetchMarine(lat, lng) {
  const b = `${MARINE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&forecast_days=7&past_days=2` +
    '&hourly=wave_height,wave_direction,sea_surface_temperature';
  const full = `${b},wave_period,swell_wave_height,ocean_current_velocity,ocean_current_direction`;
  for (const u of [`${full}&models=best_match`, full, b]) {
    try { return await getJson(u); } catch { /* sıradakini dene */ }
  }
  return null;
}

// Birden çok nokta için tek deniz isteği (Open-Meteo virgülle ayrılmış konum kabul eder, sırayla dizi döner)
const asList = (j, n) => (Array.isArray(j) ? j : n === 1 ? [j] : []);
async function fetchMarineMany(pts) {
  if (!pts.length) return [];
  const la = pts.map(p => p[0].toFixed(4)).join(','), ln = pts.map(p => p[1].toFixed(4)).join(',');
  const b = `${MARINE}?latitude=${la}&longitude=${ln}&timezone=auto&forecast_days=7&past_days=2&hourly=wave_height,wave_direction,sea_surface_temperature`;
  const full = `${b},wave_period,swell_wave_height,ocean_current_velocity,ocean_current_direction`;
  for (const u of [`${full}&models=best_match`, full, b]) {
    try { const l = asList(await getJson(u, 2), pts.length); if (l.length === pts.length) return l; } catch { /* sıradakini dene */ }
  }
  return pts.map(() => null);
}

// Kıyıya çok yakın noktalarda deniz modeli boş dönebilir (dar boğaz, iskele ucu).
// 'Deniz' olarak işaretlenen merada çevredeki en yakın deniz noktasını ara (~3, 7, 11 km).
async function nearestSeaMarine(lat, lng) {
  // Daha önce bulunduysa doğrudan o noktaya sor (her seferinde 8–24 istek atmamak için)
  const sk = 'sea1:' + key(lat, lng);
  try {
    const c = JSON.parse(localStorage.getItem(sk));
    if (c) { const m = await fetchMarine(c.lat, c.lng); if (hasWaves(m)) return { m, distKm: c.distKm }; }
  } catch { /* yeniden ara */ }
  for (const d of [0.03, 0.06, 0.1]) {
    const pts = [...Array(8)].map((_, k) => {
      const a = k * Math.PI / 4;
      return [lat + d * Math.cos(a), lng + d * Math.sin(a) / Math.cos(lat * Math.PI / 180)];
    });
    const res = await fetchMarineMany(pts);
    const i = res.findIndex(hasWaves);
    if (i >= 0) {
      try { localStorage.setItem(sk, JSON.stringify({ lat: pts[i][0], lng: pts[i][1], distKm: Math.round(d * 111) })); } catch { /* yok */ }
      return { m: res[i], distKm: Math.round(d * 111) };
    }
  }
  return null;
}

// Bir nokta için 5 gün geçmiş + 7 gün tahmin
export async function getConditions(lat, lng, { force = false, wantSea = false } = {}) {
  const k = key(lat, lng) + (wantSea ? ':s' : '');
  const hit = memCache.get(k);
  if (!force && hit && Date.now() - hit.fetchedAt < TTL) return hit;

  const base = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&forecast_days=7`;
  const fUrl = `${FORECAST}?${base}&past_days=5&wind_speed_unit=kmh&models=best_match&hourly=${HOURLY}&daily=sunrise,sunset`;
  // 15 dakikalık veri (önümüzdeki 48 saat). Desteklenmezse saatlik veriden ara değer hesaplanır.
  const qUrl = `${FORECAST}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&wind_speed_unit=kmh&models=best_match&minutely_15=${M15}&forecast_minutely_15=192&past_minutely_15=4`;

  try {
    // Ek deniz değişkenleri bir noktada desteklenmezse temel değişkenlerle tekrar dene
    const quarter = getJson(qUrl).catch(() => null);
    let [f, m, q] = await Promise.all([getJson(fUrl), fetchMarine(lat, lng), quarter]);
    let marineDist = 0;
    if (wantSea && !hasWaves(m)) {
      const near = await nearestSeaMarine(lat, lng);
      if (near) { m = near.m; marineDist = near.distKm; }
    }
    const cond = normalize(f, m, q);
    cond.fetchedAt = Date.now();
    cond.marineDist = marineDist;
    memCache.set(k, cond);
    wxSave(k, { f, m, q, marineDist, fetchedAt: cond.fetchedAt });
    return cond;
  } catch (err) {
    try {
      const c = JSON.parse(localStorage.getItem('wx2:' + k));
      if (c) { const cond = normalize(c.f, c.m, c.q); cond.fetchedAt = c.fetchedAt; cond.marineDist = c.marineDist || 0; cond.offline = true; return cond; }
    } catch { /* yok */ }
    throw err;
  }
}

// ——— Toplu ön yükleme: tüm meraların havası tek istekte ———
// 12 mera için ~50 ayrı istek yerine 3 istek (saatlik, 15 dk, deniz). Sonra getConditions önbellekten okur.
export async function prefetchConditions(points, { force = false } = {}) {
  const need = points.filter(p => {
    const hit = memCache.get(key(p.lat, p.lng) + (p.wantSea ? ':s' : ''));
    return force || !hit || Date.now() - hit.fetchedAt >= TTL;
  });
  for (let s = 0; s < need.length; s += 25) {
    const part = need.slice(s, s + 25);
    const la = part.map(p => p.lat.toFixed(4)).join(','), ln = part.map(p => p.lng.toFixed(4)).join(',');
    const base = `latitude=${la}&longitude=${ln}&timezone=auto&forecast_days=7`;
    const fUrl = `${FORECAST}?${base}&past_days=5&wind_speed_unit=kmh&models=best_match&hourly=${HOURLY}&daily=sunrise,sunset`;
    const qUrl = `${FORECAST}?latitude=${la}&longitude=${ln}&timezone=auto&wind_speed_unit=kmh&models=best_match&minutely_15=${M15}&forecast_minutely_15=192&past_minutely_15=4`;
    let fs, qs, ms;
    try {
      [fs, qs, ms] = await Promise.all([
        getJson(fUrl).then(j => asList(j, part.length)),
        getJson(qUrl).then(j => asList(j, part.length)).catch(() => []),
        fetchMarineMany(part.map(p => [p.lat, p.lng])),
      ]);
    } catch { continue; } // olmazsa her mera tek tek denenir (getConditions)
    if (fs.length !== part.length) continue;
    await Promise.all(part.map(async (p, i) => {
      let m = ms[i], marineDist = 0;
      if (p.wantSea && !hasWaves(m)) { const near = await nearestSeaMarine(p.lat, p.lng).catch(() => null); if (near) { m = near.m; marineDist = near.distKm; } }
      const cond = normalize(fs[i], m, qs[i] || null);
      cond.fetchedAt = Date.now(); cond.marineDist = marineDist;
      const k = key(p.lat, p.lng) + (p.wantSea ? ':s' : '');
      memCache.set(k, cond);
      wxSave(k, { f: fs[i], m, q: qs[i] || null, marineDist, fetchedAt: cond.fetchedAt });
    }));
  }
}

// API "2026-11-02T14:00" gibi konumun yerel saatini döndürür
function localDate(s) {
  const [d, t] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  return new Date(y, mo - 1, da, hh, mm);
}

function normalize(f, m, q) {
  const h = f.hourly;
  const mi = new Map();
  if (m?.hourly) m.hourly.time.forEach((t, i) => mi.set(t, i));
  const pick = (arr, i) => (arr && i != null ? arr[i] ?? null : null);
  const hours = h.time.map((t, i) => {
    const j = mi.get(t);
    return {
      date: localDate(t),
      temp: h.temperature_2m[i],
      feels: pick(h.apparent_temperature, i),
      humidity: pick(h.relative_humidity_2m, i),
      visibility: pick(h.visibility, i),
      uv: pick(h.uv_index, i),
      wind: h.wind_speed_10m[i],
      windDir: h.wind_direction_10m[i],
      gust: h.wind_gusts_10m[i],
      pressure: h.pressure_msl[i],
      precip: pick(h.precipitation, i),
      rainProb: pick(h.precipitation_probability, i),
      cloud: pick(h.cloud_cover, i),
      code: pick(h.weather_code, i),
      isDay: pick(h.is_day, i),
      wave: pick(m?.hourly?.wave_height, j),
      waveDir: pick(m?.hourly?.wave_direction, j),
      sst: pick(m?.hourly?.sea_surface_temperature, j),
      wavePeriod: pick(m?.hourly?.wave_period, j),
      swell: pick(m?.hourly?.swell_wave_height, j),
      current: pick(m?.hourly?.ocean_current_velocity, j),
      currentDir: pick(m?.hourly?.ocean_current_direction, j),
    };
  });
  const suns = f.daily.time.map((d, i) => ({ day: d, rise: localDate(f.daily.sunrise[i]), set: localDate(f.daily.sunset[i]) }));
  // Deniz verisi geliyorsa nokta denizdedir; gelmiyorsa tatlı su (göl/baraj/dere) kabul edilir
  const seaDetected = hasWaves(m);
  // 15 dakikalık veriler: zaman damgası (ms) → değerler
  const m15 = new Map();
  const Q = q?.minutely_15;
  if (Q?.time) Q.time.forEach((t, i) => {
    if (Q.temperature_2m?.[i] == null) return;
    m15.set(localDate(t).getTime(), {
      temp: Q.temperature_2m[i], precip15: Q.precipitation?.[i] ?? null, wind: Q.wind_speed_10m?.[i] ?? null,
      windDir: Q.wind_direction_10m?.[i] ?? null, gust: Q.wind_gusts_10m?.[i] ?? null, code: Q.weather_code?.[i] ?? null, isDay: Q.is_day?.[i] ?? null,
    });
  });
  return { hours, suns, seaDetected, m15 };
}

// ——— Rüzgar yönleri (Türk denizci isimleriyle) ———
const WIND_NAMES = ['Yıldız', 'Poyraz', 'Gündoğusu', 'Keşişleme', 'Kıble', 'Lodos', 'Günbatısı', 'Karayel'];
export function windName(deg, short = false) {
  if (deg == null) return '—';
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return short ? WIND_NAMES[i] : `${WIND_NAMES[i]} (${['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'][i]})`;
}
// Ok, rüzgarın estiği yöne bakar
export const arrow = deg => deg == null ? '' : `<span class="arrow" style="transform:rotate(${deg + 180}deg)">↑</span>`;

export function weatherText(code) {
  if (code == null) return '';
  if (code >= 95) return '⛈️ Fırtına/şimşek';
  if (code >= 80) return '🌦️ Sağanak';
  if (code >= 71) return '🌨️ Kar';
  if (code >= 51) return '🌧️ Yağmur';
  if (code >= 45) return '🌫️ Sis';
  if (code >= 3) return '☁️ Kapalı';
  if (code >= 1) return '⛅ Parçalı bulutlu';
  return '☀️ Açık';
}

// Saatlik hava simgesi (gece için ay)
export function weatherIcon(code, isDay = 1) {
  if (code == null) return '·';
  if (code >= 95) return '⛈️';
  if (code >= 85) return '🌨️';
  if (code >= 80) return '🌦️';
  if (code >= 71) return '❄️';
  if (code >= 61) return '🌧️';
  if (code >= 51) return '🌦️';
  if (code >= 45) return '🌫️';
  if (code >= 3) return '☁️';
  if (code >= 2) return isDay ? '⛅' : '☁️';
  if (code >= 1) return isDay ? '🌤️' : '🌙';
  return isDay ? '☀️' : '🌙';
}

export function weatherWord(code) {
  if (code == null) return '';
  if (code >= 95) return 'Fırtına';
  if (code >= 80) return 'Sağanak';
  if (code >= 71) return 'Kar';
  if (code >= 61) return 'Yağmur';
  if (code >= 51) return 'Çisenti';
  if (code >= 45) return 'Sis';
  if (code >= 3) return 'Kapalı';
  if (code >= 1) return 'Parçalı';
  return 'Açık';
}

// ——— Suya bakış yönü (yükselti verisinden otomatik) ———
// Meranın çevresinde 150/300/600 m uzaklıkta 16 yöne bakılır; su seviyesindeki (en düşük, düz)
// noktalar 'su' sayılır. Su noktalarının ortalama yönü = suya bakış yönü (0=K, 90=D).
// Her yanı su (iskele/mendirek ucu) ya da hiç su yoksa null döner.
const ELEV = 'https://api.open-meteo.com/v1/elevation';
const shoreCache = new Map();
export async function detectShore(lat, lng) {
  const k = key(lat, lng);
  if (shoreCache.has(k)) return shoreCache.get(k);
  const pts = [[lat, lng]];
  const dirs = 16, radii = [150, 300, 600];
  for (const rm of radii) for (let d = 0; d < dirs; d++) {
    const a = d * 2 * Math.PI / dirs;
    const dLat = (rm * Math.cos(a)) / 111320, dLng = (rm * Math.sin(a)) / (111320 * Math.cos(lat * Math.PI / 180));
    pts.push([lat + dLat, lng + dLng]);
  }
  try {
    const url = `${ELEV}?latitude=${pts.map(p => p[0].toFixed(5)).join(',')}&longitude=${pts.map(p => p[1].toFixed(5)).join(',')}`;
    const j = await getJson(url);
    const el = j.elevation;
    if (!Array.isArray(el) || el.length !== pts.length) throw new Error();
    const lvl = Math.min(...el);
    let x = 0, y = 0, waterDirs = 0;
    for (let d = 0; d < dirs; d++) {
      let wet = 0;
      radii.forEach((_, ri) => { if (el[1 + ri * dirs + d] <= lvl + 1) wet++; });
      if (wet) { waterDirs++; const a = d * 2 * Math.PI / dirs; x += wet * Math.sin(a); y += wet * Math.cos(a); }
    }
    const land = el.filter(v => v > lvl + 2).length;
    let res = null;
    if (waterDirs > 0 && waterDirs <= 13 && land >= 6 && Math.hypot(x, y) > 0.5) {
      res = { bearing: Math.round(((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360), auto: true };
    } else if (waterDirs > 13) res = { bearing: null, open: true, auto: true };
    else res = { bearing: null, none: true, auto: true };
    shoreCache.set(k, res);
    return res;
  } catch { return null; }
}

// ——— Su tipi tespiti (deniz / göl / nehir) ———
// 1) OpenStreetMap'te noktanın yakınındaki su: körfez/boğaz/deniz → deniz, göl/baraj/gölet → göl, nehir/dere → nehir.
// 2) Bulunamazsa deniz modeli: noktada ya da ~2 km içinde dalga verisi varsa deniz, yoksa göl.
// Sonuç ~100 m'lik kareler için telefonda saklanır (Nominatim'i yormamak için).
let nomQueue = Promise.resolve();
const nomThrottle = fn => { const p = nomQueue.then(fn, fn); nomQueue = p.then(() => new Promise(r => setTimeout(r, 1100)), () => new Promise(r => setTimeout(r, 1100))); return p; };
const SEA_TYPES = new Set(['bay', 'strait', 'sea', 'ocean', 'coastline', 'fjord', 'sound']);
const LAKE_WATER = new Set(['lake', 'reservoir', 'pond', 'basin', 'lagoon', 'oxbow', 'lock']);
const RIVER_TYPES = new Set(['river', 'stream', 'canal', 'brook', 'riverbank', 'creek']);
export function classifyOsm(j) {
  if (!j || j.error) return null;
  const cat = j.category || j.class, type = j.type, water = j.extratags?.water;
  if ((cat === 'place' && (type === 'sea' || type === 'ocean')) || (cat === 'natural' && SEA_TYPES.has(type))) return 'sea';
  if (cat === 'waterway' && RIVER_TYPES.has(type)) return 'river';
  if (water === 'river' || water === 'stream' || water === 'canal') return 'river';
  if (cat === 'natural' && type === 'water') return 'lake'; // OSM'de göller "natural=water" (water=lake/reservoir…)
  if (LAKE_WATER.has(type) || LAKE_WATER.has(water) || (cat === 'landuse' && type === 'reservoir')) return 'lake';
  return null;
}
// Overpass (OpenStreetMap): noktanın çevresindeki TÜM suları getir, öncelikle karar ver.
// Sorun: Nominatim "en yakın tek nesne"yi verir; göle akan dere ya da barajın içinden geçen nehir
// çoğu zaman gölden "daha yakın" sayılır ve göl yanlışlıkla nehir çıkar.
// Öncelik: içinde/300 m yakınında göl-baraj-gölet → göl; deniz kıyı çizgisi/körfez/boğaz → deniz;
// ancak bunlar yoksa 150 m içinde nehir/dere → nehir.
const OVERPASS = 'https://overpass-api.de/api/interpreter';
let opQueue = Promise.resolve();
const opThrottle = fn => { const p = opQueue.then(fn, fn); opQueue = p.then(() => sleep(1500), () => sleep(1500)); return p; };
const isLakeTags = t => (t.natural === 'water' && !['river', 'stream', 'canal', 'ditch', 'drain', 'wastewater', 'lagoon_salt'].includes(t.water)) || t.landuse === 'reservoir' || t.water === 'reservoir' || t.water === 'lake' || t.water === 'pond';
const isRiverTags = t => ['river', 'stream', 'canal', 'brook'].includes(t.waterway) || (t.natural === 'water' && ['river', 'stream', 'canal'].includes(t.water));
const isSeaTags = t => t.natural === 'coastline' || t.natural === 'bay' || t.natural === 'strait' || t.place === 'sea' || t.place === 'ocean';
export function classifyOverpass(elements) {
  const el = (elements || []).filter(e => e.tags);
  const inside = el.filter(e => e.type === 'area');            // noktanın içinde olduğu alanlar (is_in)
  const near = el.filter(e => e.type !== 'area' && !e.tags.waterway); // 300 m içindeki göl/deniz kıyıları
  const rivers = el.filter(e => e.type !== 'area' && e.tags.waterway); // 150 m içindeki nehir/dere çizgileri
  const nm = e => e.tags['name:tr'] || e.tags.name || '';
  // 1) İçinde olduğu alan
  const inLake = inside.find(e => isLakeTags(e.tags)), inSea = inside.find(e => isSeaTags(e.tags));
  if (inLake) return { type: 'lake', name: nm(inLake) };
  if (inSea) return { type: 'sea', name: nm(inSea) };
  // 2) Yakındaki göl/baraj (dere aksa bile göl), sonra deniz, en son nehir
  const lake = near.find(e => isLakeTags(e.tags));
  const sea = near.find(e => isSeaTags(e.tags));
  // Deniz de yakınsa: adı olan göl (ör. Küçükçekmece) göl; adsız küçük gölet denizi ezmesin
  if (lake && (!sea || nm(lake))) return { type: 'lake', name: nm(lake) };
  if (sea) return { type: 'sea', name: nm(sea) };
  const river = rivers.find(e => isRiverTags(e.tags)) || near.find(e => isRiverTags(e.tags));
  if (river) return { type: 'river', name: nm(river) };
  return null;
}
async function overpassWater(lat, lng) {
  const p = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const q = `[out:json][timeout:15];
is_in(${p})->.a;
(area.a[natural=water];area.a[landuse=reservoir];area.a[natural=bay];area.a[natural=strait];area.a[place=sea];);
out tags;
(way(around:300,${p})[natural=water];relation(around:300,${p})[natural=water];
way(around:300,${p})[landuse=reservoir];relation(around:300,${p})[landuse=reservoir];
way(around:300,${p})[natural=coastline];
way(around:600,${p})[natural~"^(bay|strait)$"];relation(around:600,${p})[natural~"^(bay|strait)$"];);
out tags;
way(around:150,${p})[waterway~"^(river|stream|canal|brook)$"];
out tags;`;
  const j = await opThrottle(() => getJson(`${OVERPASS}?data=${encodeURIComponent(q)}`, 2));
  return classifyOverpass(j.elements);
}

// Daha önce bulunduysa hemen döndür (beklemeden)
export function cachedWater(lat, lng) {
  try { const c = JSON.parse(localStorage.getItem('wt3:' + key(lat, lng))); return c?.type ? c : null; } catch { return null; }
}
const pendingWater = new Map();
export function detectWater(lat, lng) {
  const k = key(lat, lng);
  if (!pendingWater.has(k)) pendingWater.set(k, detectWaterNow(lat, lng).finally(() => pendingWater.delete(k)));
  return pendingWater.get(k);
}
async function detectWaterNow(lat, lng) {
  const ck = 'wt3:' + key(lat, lng);
  try { const c = JSON.parse(localStorage.getItem(ck)); if (c?.type) return c; } catch { /* yok */ }
  let res = null;
  try {
    const o = await overpassWater(lat, lng);
    if (o) res = { ...o, source: 'osm' };
  } catch { /* Overpass yoğun/erişilemez: Nominatim'e bak */ }
  if (!res) try {
    const j = await nomThrottle(() => getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&layer=natural&extratags=1&accept-language=tr`));
    const t = classifyOsm(j);
    if (t) res = { type: t, source: 'osm', name: j.name || j.address?.water || '' };
  } catch { /* ağ yok: deniz modeline bak */ }
  if (!res) {
    let m = await fetchMarine(lat, lng);
    if (!hasWaves(m)) {
      // Kıyıda durulan nokta karada kalır: ~2 km çevreye bak
      const d = 0.02;
      const ring = await fetchMarineMany([...Array(8)].map((_, k) => { const a = k * Math.PI / 4; return [lat + d * Math.cos(a), lng + d * Math.sin(a) / Math.cos(lat * Math.PI / 180)]; }));
      m = ring.find(hasWaves) || null;
    }
    // Haritada su yok ve ~2 km'de deniz yok: kayıtlı merada küçük gölet olabilir (göl say), konum kartı "yakında su yok" der
    res = hasWaves(m) ? { type: 'sea', source: 'marine', name: '' } : { type: 'lake', source: 'none', name: '', noWater: true };
  }
  try { localStorage.setItem(ck, JSON.stringify(res)); } catch { /* dolu */ }
  return res;
}
