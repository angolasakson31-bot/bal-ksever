// Hava ve deniz verisi: Open-Meteo (ücretsiz, anahtarsız, saatlik güncellenir).
// "best_match" modu, konuma göre en iyi sayısal hava modellerini (ECMWF, DWD ICON, Météo-France vb.)
// otomatik seçip birleştirir. Uygulamanın güncellenmesi gerekmez; veriler her açılışta ve
// 10 dakikada bir yeniden çekilir.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
export const TTL = 20 * 60000; // 20 dakika (hava modeli saatte bir güncellenir)
const memCache = new Map();
const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,visibility,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation,precipitation_probability,cloud_cover,weather_code,is_day';

// İstek: ağ hatası, zaman aşımı, 429 (çok istek) ve 5xx'te birkaç saniye arayla tekrar dene
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Hava servisine son başarılı / başarısız erişim zamanı (yenile düğmesi sonucu için)
export const netStatus = { ok: 0, fail: 0 };
// "Çok istek" (429) gelirse bir süre hiç istek atılmaz: tekrar denemek sınırı daha da zorlar
let blockedUntil = 0;
export const weatherBlocked = () => Date.now() < blockedUntil;
async function getJson(url, tries = 2, timeoutMs = 10000) {
  const om = url.includes('open-meteo.com');
  if (om && weatherBlocked()) throw new Error('Hava servisi çok istek aldı; birkaç dakika sonra yeniden denenecek.');
  let lastErr;
  for (let t = 0; t < tries; t++) {
    if (t) await sleep(1500);
    let res, body = null;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = ctl && setTimeout(() => ctl.abort(), timeoutMs);
    try {
      res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      body = await res.json().catch(() => null); // gövde okuması da zaman aşımına dahil
    } catch { lastErr = new Error('İnternet bağlantısı yok veya hava servisine ulaşılamadı.'); continue; }
    finally { clearTimeout(to); }
    if (res.ok && body && !body.error) { if (url.startsWith(FORECAST) && url.includes('hourly=')) netStatus.ok = Date.now(); return body; }
    lastErr = new Error(`Hava servisi hatası (${res.status}): ${body?.reason || 'bilinmeyen'}`);
    if (res.status === 429) { if (om) blockedUntil = Date.now() + (/hour|daily|saat/i.test(body?.reason || '') ? 15 : 2) * 60000; break; }
    if (res.status < 500) break; // hatalı istek: tekrar denemenin anlamı yok
  }
  if (url.startsWith(FORECAST) && url.includes('hourly=')) netStatus.fail = Date.now();
  throw lastErr;
}

// ——— Geçici hava kaydı (telefonda) ———
// Yalnızca hava verisi; meralar/avlar burada değil (onlar veritabanında, hiç silinmez).
// Küçük kayıt alanı (~5 MB) dolmasın diye en yeni 24 nokta tutulur, eskiler silinir.
const WX_MAX = 24;
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
const isErr = m => m === MARINE_ERR;

// Deniz verisi. Dönüş: veri | null (bu noktada deniz verisi yok) | MARINE_ERR (servise ulaşılamadı)
const MARINE_ERR = { error: true };
const MVARS = 'wave_height,wave_direction,sea_surface_temperature';
const MFULL = `${MVARS},wave_period,swell_wave_height,ocean_current_velocity,ocean_current_direction`;
const marineUrl = (la, ln, vars) => `${MARINE}?latitude=${la}&longitude=${ln}&timezone=auto&forecast_days=7&past_days=5&hourly=${vars}`;
async function fetchMarine(lat, lng) {
  let failed = false;
  for (const v of [MFULL, MVARS]) {
    try { return await getJson(marineUrl(lat.toFixed(2), lng.toFixed(2), v), 1, 8000); } catch (e) { failed = failed || !/\(4\d\d\)/.test(e.message); }
  }
  return failed ? MARINE_ERR : null;
}

// Birden çok nokta için tek deniz isteği (Open-Meteo virgülle ayrılmış konum kabul eder, sırayla dizi döner)
const asList = (j, n) => (Array.isArray(j) ? j : n === 1 ? [j] : []);
async function fetchMarineMany(pts) {
  if (!pts.length) return [];
  const la = pts.map(p => p[0].toFixed(2)).join(','), ln = pts.map(p => p[1].toFixed(2)).join(',');
  let failed = false;
  for (const v of [MFULL, MVARS]) {
    try { const l = asList(await getJson(marineUrl(la, ln, v), 1, 8000), pts.length); if (l.length === pts.length) return l; } catch (e) { failed = failed || !/\(4\d\d\)/.test(e.message); }
  }
  return pts.map(() => (failed ? MARINE_ERR : null));
}

// Kıyıya çok yakın noktalarda deniz modeli boş dönebilir (dar boğaz, iskele ucu).
// 'Deniz' olarak işaretlenen merada çevredeki en yakın deniz noktasını ara (~3, 7, 11 km).
async function nearestSeaMarine(lat, lng) {
  const sk = 'sea1:' + key(lat, lng);
  try {
    const c = JSON.parse(localStorage.getItem(sk));
    if (c?.none && Date.now() - c.at < 24 * 3600e3) return null;            // yakında deniz verisi yok: bir gün boyunca yeniden arama
    if (c?.lat != null && (!c.at || Date.now() - c.at < 30 * 864e5)) {
      const m = await fetchMarine(c.lat, c.lng);
      if (hasWaves(m)) return { m, distKm: c.distKm };
      if (isErr(m)) return { m: MARINE_ERR, distKm: c.distKm };
    }
  } catch { /* yeniden ara */ }
  for (const d of [0.03, 0.06, 0.1]) {
    const pts = [...Array(8)].map((_, k) => {
      const a = k * Math.PI / 4;
      return [lat + d * Math.cos(a), lng + d * Math.sin(a) / Math.cos(lat * Math.PI / 180)];
    });
    const res = await fetchMarineMany(pts);
    if (res.some(isErr)) return { m: MARINE_ERR, distKm: 0 };               // ağ hatası: sonuç saklanmaz
    const i = res.findIndex(hasWaves);
    if (i >= 0) {
      try { localStorage.setItem(sk, JSON.stringify({ lat: pts[i][0], lng: pts[i][1], distKm: Math.round(d * 111), at: Date.now() })); } catch { /* yok */ }
      return { m: res[i], distKm: Math.round(d * 111) };
    }
  }
  try { localStorage.setItem(sk, JSON.stringify({ none: true, at: Date.now() })); } catch { /* yok */ }
  return null;
}

// Bir nokta için 5 gün geçmiş + 7 gün tahmin
const fUrlFor = (la, ln) => `${FORECAST}?latitude=${la}&longitude=${ln}&timezone=auto&forecast_days=7&past_days=5&wind_speed_unit=kmh&models=best_match&hourly=${HOURLY}&daily=sunrise,sunset`;
const stored = k => { try { return JSON.parse(localStorage.getItem('wx2:' + k)); } catch { return null; } };
function fromStore(k, c, extra = {}) {
  const cond = normalize(c.f, c.m, null);
  return Object.assign(cond, { fetchedAt: c.fetchedAt, marineDist: c.marineDist || 0, marineStale: !!c.marineStale }, extra);
}
// Deniz servisi hata verdiyse önceki deniz verisini kullan (mera "göl" sanılmasın, dalga bilgisi kaybolmasın)
function keepMarine(k, m, marineDist) {
  if (!isErr(m)) return { m, marineDist, marineStale: false };
  const old = stored(k) || stored(k.endsWith(':s') ? k.slice(0, -2) : k + ':s');
  return old?.m ? { m: old.m, marineDist: old.marineDist || 0, marineStale: true } : { m: null, marineDist: 0, marineStale: true };
}
const inflight = new Map();
export function getConditions(lat, lng, { force = false, wantSea = false } = {}) {
  const k = key(lat, lng) + (wantSea ? ':s' : '');
  const hit = memCache.get(k);
  if (!force && hit && Date.now() - hit.fetchedAt < TTL) return Promise.resolve(hit);
  // Uygulama yeni açıldıysa telefondaki taze kayıt kullanılır (her açılışta yeniden indirme)
  if (!force && !hit) {
    const c = stored(k);
    if (c?.f && Date.now() - c.fetchedAt < TTL) { const cond = fromStore(k, c); memCache.set(k, cond); return Promise.resolve(cond); }
  }
  // Aynı nokta için süren istek varsa ikincisi atılmaz
  if (inflight.has(k)) return inflight.get(k);
  const p = loadConditions(lat, lng, k, wantSea).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}
async function loadConditions(lat, lng, k, wantSea) {
  try {
    let [f, m0] = await Promise.all([getJson(fUrlFor(lat.toFixed(2), lng.toFixed(2))), fetchMarine(lat, lng)]);
    let marineDist = 0;
    if (wantSea && !isErr(m0) && !hasWaves(m0)) {
      const near = await nearestSeaMarine(lat, lng);
      if (near) { m0 = near.m; marineDist = near.distKm; }
    }
    const km = keepMarine(k, m0, marineDist);
    const cond = normalize(f, km.m, null);
    Object.assign(cond, { fetchedAt: Date.now(), marineDist: km.marineDist, marineStale: km.marineStale });
    memCache.set(k, cond);
    wxSave(k, { f, m: km.m, marineDist: km.marineDist, marineStale: km.marineStale, fetchedAt: cond.fetchedAt });
    return cond;
  } catch (err) {
    // İnternet yok: bu noktanın (deniz verili ya da verisiz) son kaydı
    const c = stored(k) || stored(k.endsWith(':s') ? k.slice(0, -2) : k + ':s');
    if (c?.f) return fromStore(k, c, { offline: true });
    throw err;
  }
}

// ——— Toplu ön yükleme: tüm meraların havası tek istekte ———
// 12 mera için ~50 ayrı istek yerine 3 istek (saatlik, 15 dk, deniz). Sonra getConditions önbellekten okur.
export async function prefetchConditions(points, { force = false } = {}) {
  const done = new Set(); // bu çağrıda başarıyla yenilenen noktalar
  const need = points.filter(p => {
    const k = key(p.lat, p.lng) + (p.wantSea ? ':s' : '');
    const hit = memCache.get(k);
    if (!force && hit && Date.now() - hit.fetchedAt < TTL) return false;
    if (!force && !hit) { const c = stored(k); if (c?.f && Date.now() - c.fetchedAt < TTL) { memCache.set(k, fromStore(k, c)); return false; } }
    return true;
  });
  for (let s = 0; s < need.length; s += 25) {
    const part = need.slice(s, s + 25);
    const la = part.map(p => p.lat.toFixed(2)).join(','), ln = part.map(p => p.lng.toFixed(2)).join(',');
    let fs, ms;
    try {
      [fs, ms] = await Promise.all([
        getJson(fUrlFor(la, ln)).then(j => asList(j, part.length)),
        fetchMarineMany(part.map(p => [p.lat, p.lng])),
      ]);
    } catch { continue; } // olmazsa her mera tek tek denenir (getConditions; o da olmazsa son kayıt gösterilir)
    if (fs.length !== part.length) continue;
    await Promise.all(part.map(async (p, i) => {
      let m = ms[i], marineDist = 0;
      if (p.wantSea && !isErr(m) && !hasWaves(m)) { const near = await nearestSeaMarine(p.lat, p.lng).catch(() => null); if (near) { m = near.m; marineDist = near.distKm; } }
      const k = key(p.lat, p.lng) + (p.wantSea ? ':s' : '');
      const km = keepMarine(k, m, marineDist);
      const cond = normalize(fs[i], km.m, null);
      Object.assign(cond, { fetchedAt: Date.now(), marineDist: km.marineDist, marineStale: km.marineStale });
      memCache.set(k, cond);
      wxSave(k, { f: fs[i], m: km.m, marineDist: km.marineDist, marineStale: km.marineStale, fetchedAt: cond.fetchedAt });
      done.add(k);
    }));
  }
  return done;
}
export const condKey = (lat, lng, wantSea) => key(lat, lng) + (wantSea ? ':s' : '');

// ——— Son 60 günün günlük hava sıcaklığı (göl/dere suyu sıcaklığı tahmini için) ———
// Göller havayı haftalarca geriden izler; bu yüzden yalnız son 5 gün yetmez.
// Ayrı ve küçük bir istek (yalnız günlük en yüksek/en düşük): saatlik veriyi büyütmez.
// Her nokta için 6 saatte bir yenilenir, telefonda saklanır.
const AIR_TTL = 6 * 3600e3, AIR_MAX = 60;
const airMem = new Map();
const airUrl = (la, ln) => `${FORECAST}?latitude=${la}&longitude=${ln}&timezone=auto&past_days=60&forecast_days=7&models=best_match&daily=temperature_2m_max,temperature_2m_min`;
function airParse(j) {
  const d = j?.daily;
  if (!d?.time) return null;
  const t = d.time.map((_, i) => (d.temperature_2m_max[i] != null && d.temperature_2m_min[i] != null ? (d.temperature_2m_max[i] + d.temperature_2m_min[i]) / 2 : null));
  return t.filter(v => v != null).length >= 20 ? { days: d.time, t, at: Date.now() } : null;
}
function airGet(k) {
  const m = airMem.get(k);
  if (m) return m;
  try { const c = JSON.parse(localStorage.getItem('ta1:' + k)); if (c?.days) { airMem.set(k, c); return c; } } catch { /* yok */ }
  return null;
}
function airPut(k, v) {
  airMem.set(k, v);
  try {
    localStorage.setItem('ta1:' + k, JSON.stringify(v));
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) { const x = localStorage.key(i); if (x?.startsWith('ta1:')) ks.push(x); }
    if (ks.length > AIR_MAX) ks.map(x => [x, JSON.parse(localStorage.getItem(x))?.at || 0]).sort((a, b) => a[1] - b[1])
      .slice(0, ks.length - AIR_MAX).forEach(([x]) => localStorage.removeItem(x));
  } catch { /* dolu: yalnız bellekte kalsın */ }
}
export async function getAirDaily(lat, lng, { force = false } = {}) {
  const k = key(lat, lng);
  const c = airGet(k);
  if (!force && c && Date.now() - c.at < AIR_TTL) return c;
  try {
    const v = airParse(await getJson(airUrl(lat.toFixed(2), lng.toFixed(2)), 2));
    if (v) { airPut(k, v); return v; }
  } catch { /* ağ yok */ }
  return c; // eski kayıt da olur (yoksa null: eski yöntem kullanılır)
}
export async function prefetchAirDaily(points, { force = false } = {}) {
  const need = points.filter(p => { const c = airGet(key(p.lat, p.lng)); return force || !c || Date.now() - c.at >= AIR_TTL; });
  for (let s = 0; s < need.length; s += 25) {
    const part = need.slice(s, s + 25);
    try {
      const l = asList(await getJson(airUrl(part.map(p => p.lat.toFixed(2)).join(','), part.map(p => p.lng.toFixed(2)).join(',')), 2), part.length);
      if (l.length !== part.length) continue;
      part.forEach((p, i) => { const v = airParse(l[i]); if (v) airPut(key(p.lat, p.lng), v); });
    } catch { /* tek tek denenir */ }
  }
}

// API "2026-11-02T14:00" gibi konumun yerel saatini döndürür
// off: konumun UTC farkı (saniye). Verilirse gerçek ana çevrilir; böylece telefonun saat dilimi farklı olsa da
// "şu an", ay ve güneş hesapları doğru ana düşer. (Türkiye'deki telefonda sonuç aynıdır.)
function localDate(s, off = null) {
  const [d, t] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  return off == null ? new Date(y, mo - 1, da, hh, mm) : new Date(Date.UTC(y, mo - 1, da, hh, mm) - off * 1000);
}

function normalize(f, m, q) {
  const h = f.hourly;
  const off = Number.isFinite(f.utc_offset_seconds) ? f.utc_offset_seconds : null;
  const moff = Number.isFinite(m?.utc_offset_seconds) ? m.utc_offset_seconds : off;
  // Deniz ve hava saatleri gerçek ana göre eşleştirilir (deniz noktası başka saat diliminde olabilir)
  const mi = new Map();
  if (m?.hourly?.time) m.hourly.time.forEach((t, i) => mi.set(localDate(t, moff).getTime(), i));
  const pick = (arr, i) => (arr && i != null ? arr[i] ?? null : null);
  const hours = h.time.map((t, i) => {
    const date = localDate(t, off);
    const j = mi.get(date.getTime());
    return {
      date,
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
  const suns = f.daily.time.map((d, i) => ({ day: d, rise: localDate(f.daily.sunrise[i], off), set: localDate(f.daily.sunset[i], off) }))
    .filter(x => !Number.isNaN(x.rise.getTime()) && !Number.isNaN(x.set.getTime()));
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
  if (HARBOUR.includes(water)) return 'sea';
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
// Liman havuzu, marina, tuzlu lagün "göl" değildir (deniz suyu)
const HARBOUR = ['harbour', 'harbor', 'dock', 'marina', 'basin_harbour'];
const isSeaWater = t => t.natural === 'water' && (HARBOUR.includes(t.water) || (t.water === 'lagoon' && ['yes', 'brackish', 'saline'].includes(t.salt)));
const isLakeTags = t => !isSeaWater(t) && ((t.natural === 'water' && !['river', 'stream', 'canal', 'ditch', 'drain', 'wastewater', 'basin'].includes(t.water)) || t.landuse === 'reservoir' || t.water === 'reservoir' || t.water === 'lake' || t.water === 'pond');
const isRiverTags = t => ['river', 'stream', 'canal', 'brook'].includes(t.waterway) || (t.natural === 'water' && ['river', 'stream', 'canal'].includes(t.water));
const isSeaTags = t => t.natural === 'coastline' || t.natural === 'bay' || t.natural === 'strait' || t.place === 'sea' || t.place === 'ocean' || isSeaWater(t);
// Göl büyüklüğü: OpenStreetMap'teki gölün sınır kutusundan (yaklaşık alan, km²)
// Sınır kutusu gölün kendisinden büyüktür (kollu/eğik göllerde çok daha büyük): yarısı alınır
const bboxKm2 = b => b ? 0.5 * Math.abs(b.maxlat - b.minlat) * 111 * Math.abs(b.maxlon - b.minlon) * 111 * Math.cos((b.minlat + b.maxlat) / 2 * Math.PI / 180) : null;
export const sizeFromArea = a => a == null ? null : a < 1 ? 'small' : a < 25 ? 'medium' : 'large';
function lakeArea(el, name, pick = null) {
  const lakes = el.filter(e => e.bounds && isLakeTags(e.tags));
  const e = (pick?.bounds ? pick : null) || (name && lakes.find(x => (x.tags['name:tr'] || x.tags.name) === name)) || lakes.sort((a, b) => bboxKm2(b.bounds) - bboxKm2(a.bounds))[0];
  const areaKm2 = e ? Math.round(bboxKm2(e.bounds) * 10) / 10 : null;
  return areaKm2 == null ? {} : { areaKm2, size: sizeFromArea(areaKm2) };
}
export function classifyOverpass(elements) {
  const el = (elements || []).filter(e => e.tags);
  const inside = el.filter(e => e.type === 'area');            // noktanın içinde olduğu alanlar (is_in)
  const near = el.filter(e => e.type !== 'area' && !e.tags.waterway); // 300 m içindeki göl/deniz kıyıları
  const rivers = el.filter(e => e.type !== 'area' && e.tags.waterway); // 150 m içindeki nehir/dere çizgileri
  const nm = e => e.tags['name:tr'] || e.tags.name || '';
  // 1) İçinde olduğu alan
  const inLake = inside.find(e => isLakeTags(e.tags)), inSea = inside.find(e => isSeaTags(e.tags));
  if (inLake) return { type: 'lake', name: nm(inLake), ...lakeArea(el, nm(inLake)) };
  if (inSea) return { type: 'sea', name: nm(inSea) };
  // 2) Yakındaki göl/baraj (dere aksa bile göl), sonra deniz, en son nehir
  const lake = near.find(e => isLakeTags(e.tags));
  const sea = near.find(e => isSeaTags(e.tags));
  // Deniz de yakınsa: adı olan göl (ör. Küçükçekmece) göl; adsız küçük gölet denizi ezmesin
  // Hem göl hem deniz yakınsa (lagün ağzı, baraj seti): emin değiliz, kullanıcı elle düzeltebilsin
  if (lake && (!sea || nm(lake))) return { type: 'lake', name: nm(lake), ...lakeArea(el, nm(lake), lake), ...(sea ? { unsure: 'sea' } : {}) };
  if (sea) return { type: 'sea', name: nm(sea), ...(lake ? { unsure: 'lake' } : {}) };
  const river = rivers.find(e => isRiverTags(e.tags)) || near.find(e => isRiverTags(e.tags));
  if (river) return { type: 'river', name: nm(river) };
  return null;
}
async function overpassWater(lat, lng, urgent = false) {
  const p = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const q = `[out:json][timeout:15];
is_in(${p})->.a;
(area.a[natural=water];area.a[landuse=reservoir];area.a[natural=bay];area.a[natural=strait];area.a[place=sea];);
out tags;
(way(pivot.a)[natural=water];relation(pivot.a)[natural=water];way(pivot.a)[landuse=reservoir];relation(pivot.a)[landuse=reservoir];);
out tags bb;
(way(around:300,${p})[natural=water];relation(around:300,${p})[natural=water];
way(around:300,${p})[landuse=reservoir];relation(around:300,${p})[landuse=reservoir];
way(around:300,${p})[natural=coastline];
way(around:600,${p})[natural~"^(bay|strait)$"];relation(around:600,${p})[natural~"^(bay|strait)$"];);
out tags bb;
way(around:150,${p})[waterway~"^(river|stream|canal|brook)$"];
out tags;`;
  const call = () => getJson(`${OVERPASS}?data=${encodeURIComponent(q)}`, 1, 8000);
  const j = await (urgent ? call() : opThrottle(call)); // dokunulan nokta sıra beklemez
  if (j.remark) throw new Error('Overpass yarım cevap'); // zaman aşımında eksik liste gelir: güvenme
  return classifyOverpass(j.elements);
}

// Su tipi kaydı: haritadan (OSM) gelen sonuç 90 gün, deniz modelinden/"bulunamadı"dan gelen 7 gün geçerli.
// İnternet yokken çıkan sonuç hiç saklanmaz (mera kalıcı olarak yanlış tipte kalmasın).
const WT_KEY = 'wt4:';
function readWater(lat, lng) {
  try {
    const c = JSON.parse(localStorage.getItem(WT_KEY + key(lat, lng)));
    if (!c?.type) return null;
    const age = Date.now() - (c.at || 0);
    return age < (c.source === 'osm' || c.source === 'user' ? 90 : 7) * 864e5 ? c : null;
  } catch { return null; }
}
export const cachedWater = (lat, lng) => readWater(lat, lng);
export function forgetWater(lat, lng) { tempWater.delete(key(lat, lng)); try { localStorage.removeItem(WT_KEY + key(lat, lng)); } catch { /* yok */ } }
try { // eski sürümün süresiz kayıtlarını temizle (bir kez)
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && /^wt[123]:/.test(k)) localStorage.removeItem(k); }
} catch { /* yok */ }
const pendingWater = new Map();
// urgent: kullanıcının dokunduğu nokta (harita kutusu, konum kartı, mera kaydetme): arka plandaki sırayı beklemez
export function detectWater(lat, lng, { urgent = false } = {}) {
  const k = key(lat, lng) + (urgent ? '!' : '');
  if (!pendingWater.has(k)) pendingWater.set(k, detectWaterNow(lat, lng, urgent).finally(() => pendingWater.delete(k)));
  return pendingWater.get(k);
}
// Geçici (internet yokken çıkan) sonuçlar telefona yazılmaz ama 5 dakika bellekte tutulur: sürekli yeniden denenmesin
const tempWater = new Map();
async function detectWaterNow(lat, lng, urgent = false) {
  const hit = readWater(lat, lng);
  if (hit) return hit;
  const tw = tempWater.get(key(lat, lng));
  if (tw && Date.now() - tw.at < 5 * 60000) return tw.res;
  let res = null, fails = 0;
  try {
    const o = await overpassWater(lat, lng, urgent);
    if (o) res = { ...o, source: 'osm' };
  } catch { fails++; /* Overpass yoğun/erişilemez: Nominatim'e bak */ }
  if (!res) try {
    const nomCall = () => getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&zoom=14&layer=natural&extratags=1&accept-language=tr`, 1, 6000);
    const j = await (urgent ? nomCall() : nomThrottle(nomCall));
    const t = classifyOsm(j);
    if (t) res = { type: t, source: 'osm', name: j.name || j.address?.water || '' };
  } catch { fails++; /* ağ yok: deniz modeline bak */ }
  let marineFail = false;
  if (!res) {
    let m = await fetchMarine(lat, lng);
    marineFail = isErr(m);
    if (!marineFail && !hasWaves(m)) {
      // Kıyıda durulan nokta karada kalır: ~2 km çevreye bak
      const d = 0.02;
      const ring = await fetchMarineMany([...Array(8)].map((_, k) => { const a = k * Math.PI / 4; return [lat + d * Math.cos(a), lng + d * Math.sin(a) / Math.cos(lat * Math.PI / 180)]; }));
      marineFail = ring.some(isErr);
      m = ring.find(hasWaves) || null;
    }
    // Haritada su yok ve ~2 km'de deniz yok: kayıtlı merada küçük gölet olabilir (göl say), konum kartı "yakında su yok" der
    res = hasWaves(m) ? { type: 'sea', source: 'marine', name: '', unsure: 'lake' } : { type: 'lake', source: 'none', name: '', noWater: true };
  }
  // Harita servislerinin ikisi de hata verdiyse (internet yok / servis yoğun) sonuç geçicidir: saklama
  const temporary = !res.source || (res.source !== 'osm' && (fails >= 2 || marineFail));
  if (!temporary) { try { localStorage.setItem(WT_KEY + key(lat, lng), JSON.stringify({ ...res, at: Date.now() })); } catch { /* dolu */ } }
  if (temporary) { res = { ...res, temporary: true }; tempWater.set(key(lat, lng), { res, at: Date.now() }); }
  return res;
}
// Kullanıcının elle seçtiği tip bu nokta için hatırlanır (haritada aynı yere dokununca da geçerli)
export function rememberWater(lat, lng, type) {
  try { localStorage.setItem(WT_KEY + key(lat, lng), JSON.stringify({ type, source: 'user', name: '', at: Date.now() })); } catch { /* yok */ }
}
