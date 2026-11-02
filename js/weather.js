// Hava ve deniz verisi: Open-Meteo (ücretsiz, anahtarsız, saatlik güncellenir).
// Uygulamanın güncellenmesi gerekmez; her açılışta en güncel tahmin çekilir.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const TTL = 20 * 60000; // 20 dakika
const memCache = new Map();

async function getJson(url) {
  let res;
  try { res = await fetch(url); } catch { throw new Error('İnternet bağlantısı yok veya hava servisine ulaşılamadı.'); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`Hava servisi hatası (${res.status}): ${body?.reason || 'bilinmeyen'}`);
  return body;
}

const key = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

// Bir nokta için 5 gün geçmiş + 7 gün tahmin
export async function getConditions(lat, lng, { force = false } = {}) {
  const k = key(lat, lng);
  const hit = memCache.get(k);
  if (!force && hit && Date.now() - hit.fetchedAt < TTL) return hit;

  const base = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&forecast_days=7`;
  const fUrl = `${FORECAST}?${base}&past_days=5&wind_speed_unit=kmh` +
    '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation,precipitation_probability,cloud_cover,weather_code' +
    '&daily=sunrise,sunset';
  const mUrl = `${MARINE}?${base}&past_days=2&hourly=wave_height,wave_direction,sea_surface_temperature`;

  try {
    const [f, m] = await Promise.all([getJson(fUrl), getJson(mUrl).catch(() => null)]);
    const cond = normalize(f, m);
    cond.fetchedAt = Date.now();
    memCache.set(k, cond);
    try { localStorage.setItem('wx2:' + k, JSON.stringify({ f, m, fetchedAt: cond.fetchedAt })); } catch { /* dolu */ }
    return cond;
  } catch (err) {
    try {
      const c = JSON.parse(localStorage.getItem('wx2:' + k));
      if (c) { const cond = normalize(c.f, c.m); cond.fetchedAt = c.fetchedAt; cond.offline = true; return cond; }
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

function normalize(f, m) {
  const h = f.hourly;
  const mi = new Map();
  if (m?.hourly) m.hourly.time.forEach((t, i) => mi.set(t, i));
  const pick = (arr, i) => (arr && i != null ? arr[i] ?? null : null);
  const hours = h.time.map((t, i) => {
    const j = mi.get(t);
    return {
      date: localDate(t),
      temp: h.temperature_2m[i],
      wind: h.wind_speed_10m[i],
      windDir: h.wind_direction_10m[i],
      gust: h.wind_gusts_10m[i],
      pressure: h.pressure_msl[i],
      precip: pick(h.precipitation, i),
      rainProb: pick(h.precipitation_probability, i),
      cloud: pick(h.cloud_cover, i),
      code: pick(h.weather_code, i),
      wave: pick(m?.hourly?.wave_height, j),
      waveDir: pick(m?.hourly?.wave_direction, j),
      sst: pick(m?.hourly?.sea_surface_temperature, j),
    };
  });
  const suns = f.daily.time.map((d, i) => ({ day: d, rise: localDate(f.daily.sunrise[i]), set: localDate(f.daily.sunset[i]) }));
  // Deniz verisi geliyorsa nokta denizdedir; gelmiyorsa tatlı su (göl/baraj/dere) kabul edilir
  const seaDetected = !!m?.hourly?.wave_height?.some(v => v != null);
  return { hours, suns, seaDetected };
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
