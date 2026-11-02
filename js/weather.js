// Hava ve deniz durumu: Open-Meteo (ücretsiz, anahtarsız) + ay evresi + "Rastgele skoru".
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';

export async function fetchConditions(lat, lng) {
  const common = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto&forecast_days=3`;
  const fUrl = `${FORECAST}?${common}&wind_speed_unit=kmh` +
    '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,precipitation_probability,cloud_cover' +
    '&daily=sunrise,sunset&past_days=1';
  const mUrl = `${MARINE}?${common}&hourly=wave_height,wave_direction,sea_surface_temperature&past_days=1`;

  const cacheKey = `wx:${lat.toFixed(2)},${lng.toFixed(2)}`;
  try {
    const [f, m] = await Promise.all([
      fetch(fUrl).then(r => { if (!r.ok) throw new Error('Hava verisi alınamadı'); return r.json(); }),
      fetch(mUrl).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const data = { f, m, fetchedAt: Date.now() };
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* dolu */ }
    return { ...data, offline: false };
  } catch (err) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) return { ...cached, offline: true };
    } catch { /* yok */ }
    throw err;
  }
}

// Saatlik satırlara dönüştür
export function buildHours({ f, m }) {
  const h = f.hourly;
  const marineIdx = new Map();
  if (m && m.hourly) m.hourly.time.forEach((t, i) => marineIdx.set(t, i));
  const rows = h.time.map((t, i) => {
    const mi = marineIdx.get(t);
    return {
      time: t,
      date: localDate(t),
      temp: h.temperature_2m[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i],
      windDir: h.wind_direction_10m[i],
      pressure: h.pressure_msl[i],
      rain: h.precipitation_probability ? h.precipitation_probability[i] : null,
      cloud: h.cloud_cover ? h.cloud_cover[i] : null,
      wave: mi != null ? m.hourly.wave_height[mi] : null,
      waveDir: mi != null ? m.hourly.wave_direction[mi] : null,
      sst: mi != null ? m.hourly.sea_surface_temperature[mi] : null,
    };
  });
  const suns = f.daily.time.map((d, i) => ({ day: d, rise: localDate(f.daily.sunrise[i]), set: localDate(f.daily.sunset[i]) }));
  rows.forEach((r, i) => {
    const prev = rows[i - 3];
    r.pTrend = prev && r.pressure != null && prev.pressure != null ? r.pressure - prev.pressure : null;
    Object.assign(r, scoreHour(r, suns));
  });
  return { rows, suns };
}

// API "2026-11-02T14:00" gibi yerel saat döndürür (timezone=auto)
function localDate(s) {
  const [d, t] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  return new Date(y, mo - 1, da, hh, mm);
}

// ——— Rüzgar yönleri (Türk denizci isimleriyle) ———
const WIND_NAMES = ['Yıldız', 'Poyraz', 'Gündoğusu', 'Keşişleme', 'Kıble', 'Lodos', 'Günbatısı', 'Karayel'];
const WIND_SHORT = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
export function windName(deg) {
  if (deg == null) return '—';
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return `${WIND_NAMES[i]} (${WIND_SHORT[i]})`;
}
// Ok, rüzgarın estiği yöne bakar
export const arrow = deg => deg == null ? '' : `<span class="arrow" style="transform:rotate(${deg + 180}deg)">↑</span>`;

// ——— Ay evresi ———
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14); // bilinen yeni ay
  const age = ((((date.getTime() - ref) / 86400000) % synodic) + synodic) % synodic;
  const frac = age / synodic;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * frac)) / 2 * 100);
  const names = [
    [1.84566, 'Yeni ay', '🌑'], [5.53699, 'Hilal (büyüyen)', '🌒'], [9.22831, 'İlk dördün', '🌓'],
    [12.91963, 'Şişkin ay (büyüyen)', '🌔'], [16.61096, 'Dolunay', '🌕'], [20.30228, 'Şişkin ay (küçülen)', '🌖'],
    [23.99361, 'Son dördün', '🌗'], [27.68493, 'Hilal (küçülen)', '🌘'], [99, 'Yeni ay', '🌑'],
  ];
  const [, name, icon] = names.find(([lim]) => age < lim);
  return { age, frac, illum, name, icon };
}

// ——— Rastgele skoru (1–10) ———
// Kıyı balıkçılığı için kaba bir tahmin: rüzgar, dalga, basınç eğilimi, alacakaranlık, ay, yağış.
export function scoreHour(r, suns) {
  let s = 5;
  const why = [];
  const add = (v, text) => { s += v; if (text) why.push([v, text]); };

  if (r.wind != null) {
    if (r.wind < 8) add(0.5, 'Rüzgar sakin');
    else if (r.wind < 25) add(1.5, 'Rüzgar hafif-orta, su hareketli');
    else if (r.wind < 35) add(-1, 'Rüzgar sert, atış zor');
    else add(-3, 'Rüzgar çok sert');
  }
  if (r.wave != null) {
    if (r.wave < 0.3) add(0.3, 'Deniz düz');
    else if (r.wave < 1) add(1, 'Hafif dalga, levrek için iyi');
    else if (r.wave < 1.5) add(-1, 'Dalga yüksek');
    else add(-3, 'Dalga tehlikeli, kayalıktan uzak durun');
  }
  if (r.pTrend != null) {
    if (r.pTrend <= -0.6 && r.pTrend >= -3) add(1.5, 'Basınç yavaş düşüyor, balık iştahlı');
    else if (r.pTrend < -3) add(-0.5, 'Basınç hızlı düşüyor, fırtına gelebilir');
    else if (r.pTrend >= 1.5) add(-1, 'Basınç hızlı yükseliyor');
    else add(0.3, 'Basınç sabit');
  }
  const sun = suns.find(x => x.rise.toDateString() === r.date.toDateString());
  if (sun) {
    const t = r.date.getTime() + 30 * 60000; // saatin ortası
    const nearRise = Math.abs(t - sun.rise.getTime()) / 3600000;
    const nearSet = Math.abs(t - sun.set.getTime()) / 3600000;
    if (Math.min(nearRise, nearSet) <= 1.5) add(2, 'Alacakaranlık saati');
    else if (t < sun.rise.getTime() || t > sun.set.getTime()) add(0.5, 'Gece');
    else {
      const h = r.date.getHours();
      if (h >= 11 && h <= 15) add(-0.7, 'Öğle saati');
    }
  }
  const moon = moonPhase(r.date);
  const dFull = Math.abs(moon.age - 14.77), dNew = Math.min(moon.age, 29.53 - moon.age);
  if (Math.min(dFull, dNew) < 2) add(0.5, moon.name);
  if (r.rain != null && r.rain >= 70) add(-1, 'Yağış ihtimali yüksek');

  const score = Math.max(1, Math.min(10, Math.round(s * 10) / 10));
  return { score, why };
}

export const scoreClass = s => s >= 7 ? 's-good' : s >= 4.5 ? 's-mid' : 's-bad';
export const scoreLabel = s => s >= 8 ? 'Çok iyi, hemen çık! 🎣' : s >= 6.5 ? 'İyi görünüyor' : s >= 4.5 ? 'Fena değil' : s >= 3 ? 'Zayıf' : 'Bugün evde kal';
