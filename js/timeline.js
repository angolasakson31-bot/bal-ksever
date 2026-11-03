// Dakika hassasiyetinde tahmin: herhangi bir an için (15 dk'ya yuvarlanır) hava + balık skoru.
// Önce Open-Meteo'nun 15 dakikalık verisi kullanılır; yoksa iki saatlik değer arasında ara değer hesaplanır.
import { scoreRow } from './fishscore.js';

const Q = 15 * 60000;
export const roundQ = d => new Date(Math.floor(new Date(d).getTime() / Q) * Q);

const NUM = ['temp', 'feels', 'humidity', 'visibility', 'uv', 'wind', 'gust', 'pressure', 'cloud', 'rainProb',
  'wave', 'swell', 'wavePeriod', 'sst', 'current'];
const lerpAngle = (a, b, f) => {
  if (a == null) return b;
  if (b == null) return a;
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * f + 360) % 360;
};

// a: analyze() sonucu { place, cond, type, rows }
export function rowAt(a, date) {
  const t = roundQ(date).getTime();
  a.slotCache ??= new Map();
  if (a.slotCache.has(t)) return a.slotCache.get(t);
  const H = a.cond.hours;
  let lo = 0, hi = H.length - 1, i = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (H[mid].date.getTime() <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  if (i < 0 || (i === H.length - 1 && t > H[i].date.getTime())) return null;
  const h0 = H[i], h1 = H[i + 1] || h0;
  const f = (t - h0.date.getTime()) / 3600e3;
  const v = { date: new Date(t), slot: true };
  for (const k of NUM) { const x = h0[k], y = h1[k]; v[k] = x == null ? y : y == null ? x : x + (y - x) * f; }
  v.windDir = lerpAngle(h0.windDir, h1.windDir, f);
  v.waveDir = lerpAngle(h0.waveDir, h1.waveDir, f);
  v.currentDir = lerpAngle(h0.currentDir, h1.currentDir, f);
  v.code = f < 0.5 ? h0.code : h1.code;
  v.precip = h1.precip ?? h0.precip; // mm/saat (bu saatin toplamı)
  const sun = a.cond.suns.find(s => s.rise.toDateString() === v.date.toDateString());
  v.isDay = sun ? +(v.date >= sun.rise && v.date < sun.set) : h0.isDay;
  const q = a.cond.m15?.get(t);
  if (q) {
    v.temp = q.temp;
    if (q.wind != null) v.wind = q.wind;
    if (q.windDir != null) v.windDir = q.windDir;
    if (q.gust != null) v.gust = q.gust;
    if (q.code != null) v.code = q.code;
    if (q.isDay != null) v.isDay = q.isDay;
    if (q.precip15 != null) v.precip = q.precip15 * 4;
    v.fine = true;
  }
  const r = scoreRow(v, i, H, a.cond.suns, a.type, a.place.lat, a.place.lng, 15);
  a.slotCache.set(t, r);
  return r;
}

// from'dan başlayarak `minutes` dakika boyunca `step` dakikalık dilimler
export function slots(a, from, minutes, step = 30) {
  const start = roundQ(from).getTime();
  const out = [];
  for (let m = 0; m <= minutes; m += step) {
    const r = rowAt(a, new Date(start + m * 60000));
    if (r) out.push(r);
  }
  return out;
}

// Gidiş–dönüş aralığının özeti
export function tripSummary(a, start, end) {
  const list = slots(a, start, Math.max(30, (end - start) / 60000), 30);
  if (!list.length) return null;
  const avg = list.reduce((s, r) => s + r.score, 0) / list.length;
  const best = list.reduce((b, r) => (r.score > b.score ? r : b));
  const w = list.filter(r => r.windScore != null);
  const avgWind = w.length ? Math.round(w.reduce((x, r) => x + r.windScore, 0) / w.length * 10) / 10 : null;
  const bestWind = w.length ? w.reduce((b, r) => (r.windScore > b.windScore ? r : b)) : best;
  return { list, avg: Math.round(avg * 10) / 10, best, avgWind, bestWind, danger: list.some(r => r.danger) };
}
