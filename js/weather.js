// Hava ve deniz verisi: Open-Meteo (ücretsiz, anahtarsız, saatlik güncellenir).
// "best_match" modu, konuma göre en iyi sayısal hava modellerini (ECMWF, DWD ICON, Météo-France vb.)
// otomatik seçip birleştirir. Uygulamanın güncellenmesi gerekmez; veriler her açılışta ve
// 10 dakikada bir yeniden çekilir.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
export const TTL = 10 * 60000; // 10 dakika
const memCache = new Map();

async function getJson(url) {
  let res;
  try { res = await fetch(url); } catch { throw new Error('İnternet bağlantısı yok veya hava servisine ulaşılamadı.'); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`Hava servisi hatası (${res.status}): ${body?.reason || 'bilinmeyen'}`);
  return body;
}

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

// Kıyıya çok yakın noktalarda deniz modeli boş dönebilir (dar boğaz, iskele ucu).
// 'Deniz' olarak işaretlenen merada çevredeki en yakın deniz noktasını ara (~3, 7, 11 km).
async function nearestSeaMarine(lat, lng) {
  for (const d of [0.03, 0.06, 0.1]) {
    const pts = [...Array(8)].map((_, k) => {
      const a = k * Math.PI / 4;
      return [lat + d * Math.cos(a), lng + d * Math.sin(a) / Math.cos(lat * Math.PI / 180)];
    });
    const res = await Promise.all(pts.map(([la, ln]) => fetchMarine(la, ln)));
    const i = res.findIndex(hasWaves);
    if (i >= 0) return { m: res[i], distKm: Math.round(d * 111) };
  }
  return null;
}

// Bir nokta için 5 gün geçmiş + 7 gün tahmin
export async function getConditions(lat, lng, { force = false, wantSea = false } = {}) {
  const k = key(lat, lng) + (wantSea ? ':s' : '');
  const hit = memCache.get(k);
  if (!force && hit && Date.now() - hit.fetchedAt < TTL) return hit;

  const base = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&forecast_days=7`;
  const fUrl = `${FORECAST}?${base}&past_days=5&wind_speed_unit=kmh&models=best_match` +
    '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation,precipitation_probability,cloud_cover,weather_code,is_day' +
    '&daily=sunrise,sunset';
  // 15 dakikalık veri (önümüzdeki 48 saat). Desteklenmezse saatlik veriden ara değer hesaplanır.
  const qUrl = `${FORECAST}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&wind_speed_unit=kmh&models=best_match` +
    '&minutely_15=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,is_day&forecast_minutely_15=192&past_minutely_15=4';

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
    try { localStorage.setItem('wx2:' + k, JSON.stringify({ f, m, q, marineDist, fetchedAt: cond.fetchedAt })); } catch { /* dolu */ }
    return cond;
  } catch (err) {
    try {
      const c = JSON.parse(localStorage.getItem('wx2:' + k));
      if (c) { const cond = normalize(c.f, c.m, c.q); cond.fetchedAt = c.fetchedAt; cond.marineDist = c.marineDist || 0; cond.offline = true; return cond; }
    } catch { /* yok */ }
    throw err;
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
// Daha önce bulunduysa hemen döndür (beklemeden)
export function cachedWater(lat, lng) {
  try { const c = JSON.parse(localStorage.getItem('wt1:' + key(lat, lng))); return c?.type ? c : null; } catch { return null; }
}
const pendingWater = new Map();
export function detectWater(lat, lng) {
  const k = key(lat, lng);
  if (!pendingWater.has(k)) pendingWater.set(k, detectWaterNow(lat, lng).finally(() => pendingWater.delete(k)));
  return pendingWater.get(k);
}
async function detectWaterNow(lat, lng) {
  const ck = 'wt1:' + key(lat, lng);
  try { const c = JSON.parse(localStorage.getItem(ck)); if (c?.type) return c; } catch { /* yok */ }
  let res = null;
  try {
    const j = await nomThrottle(() => getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&layer=natural&extratags=1&accept-language=tr`));
    const t = classifyOsm(j);
    if (t) res = { type: t, source: 'osm', name: j.name || j.address?.water || '' };
  } catch { /* ağ yok: deniz modeline bak */ }
  if (!res) {
    let m = await fetchMarine(lat, lng);
    if (!hasWaves(m)) {
      // Kıyıda durulan nokta karada kalır: ~2 km çevreye bak
      const d = 0.02;
      const ring = await Promise.all([...Array(8)].map((_, k) => { const a = k * Math.PI / 4; return fetchMarine(lat + d * Math.cos(a), lng + d * Math.sin(a) / Math.cos(lat * Math.PI / 180)); }));
      m = ring.find(hasWaves) || null;
    }
    res = { type: hasWaves(m) ? 'sea' : 'lake', source: 'marine', name: '' };
  }
  try { localStorage.setItem(ck, JSON.stringify(res)); } catch { /* dolu */ }
  return res;
}
