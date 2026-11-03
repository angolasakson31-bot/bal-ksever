// Rastgele balık skoru (0–10): deniz ve tatlı su için ayrı kurallar.
//
// Ağırlıklar kanıtın gücüne göre seçildi:
//  • Su sıcaklığı: balığın metabolizmasını ve beslenmesini doğrudan belirler (en güçlü etken,
//    örn. sazan ~18 °C üstünde aktif, ~8 °C altında neredeyse beslenmez).
//  • Işık (alacakaranlık / gece / öğle güneşi): yırtıcıların avlanma saatleri, kıyı balıkçılığında en tutarlı gözlem.
//  • Dalga ve rüzgar: hafif dalga suyu bulandırıp levreği kıyıya yaklaştırır; yüksek dalga avı düşürür ve tehlikelidir.
//  • Fırtına sonrası bulanık su, yağış, dere kabarması.
//  • Basınç ve ay (solunar): bilimsel kanıtı zayıf, bu yüzden düşük ağırlıkla eklendi.

export const WATER_TYPES = {
  sea: { label: 'Deniz', icon: '🌊' },
  lake: { label: 'Göl / baraj', icon: '🏞️' },
  river: { label: 'Nehir / dere', icon: '🏔️' },
};

// ——— Ay: evre + konum (düşük hassasiyetli, ~1° — solunar için yeterli) ———
const RAD = Math.PI / 180;
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const age = ((((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % synodic) + synodic) % synodic;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * age / synodic)) / 2 * 100);
  const names = [[1.85, 'Yeni ay', '🌑'], [5.54, 'Hilal (büyüyen)', '🌒'], [9.23, 'İlk dördün', '🌓'], [12.92, 'Şişkin ay', '🌔'],
    [16.61, 'Dolunay', '🌕'], [20.3, 'Şişkin ay (küçülen)', '🌖'], [23.99, 'Son dördün', '🌗'], [27.68, 'Hilal (küçülen)', '🌘'], [99, 'Yeni ay', '🌑']];
  const [, name, icon] = names.find(([lim]) => age < lim);
  return { age, illum, name, icon };
}

export function moonPosition(date, lat, lng) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = 218.316 + 13.176396 * d, M = 134.963 + 13.064993 * d, F = 93.272 + 13.22935 * d;
  const lon = (L + 6.289 * Math.sin(M * RAD)) * RAD, bet = 5.128 * Math.sin(F * RAD) * RAD, eps = 23.439 * RAD;
  const ra = Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lon));
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lon));
  const lst = (280.46061837 + 360.98564736629 * d + lng) * RAD;
  const ha = lst - ra;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
  const haDeg = ((ha / RAD) % 360 + 360) % 360; // 0 = ay tepede, 180 = ay ayak altında
  return { alt, haDeg };
}

// Solunar: büyük dönem = ay tepede/ayak altında (±1 saat), küçük dönem = ay doğuşu/batışı (±30 dk)
export function solunar(date, lat, lng) {
  const { alt, haDeg } = moonPosition(date, lat, lng);
  if (Math.min(haDeg, 360 - haDeg) < 15 || Math.abs(haDeg - 180) < 15) return 'major';
  if (Math.abs(alt) < 5) return 'minor';
  return null;
}

// ——— Yardımcılar ———
const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const sum = a => a.filter(x => x != null).reduce((s, x) => s + x, 0);
const max = a => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };

function lightPhase(date, suns, midMin = 30) {
  const sun = suns.find(s => s.rise.toDateString() === date.toDateString());
  if (!sun) return null;
  const t = date.getTime() + midMin * 60000; // zaman diliminin ortası
  const near = Math.min(Math.abs(t - sun.rise.getTime()), Math.abs(t - sun.set.getTime())) / 3600000;
  if (near <= 1.5) return 'twilight';
  if (t < sun.rise.getTime() || t > sun.set.getTime()) return 'night';
  const h = date.getHours();
  return h >= 11 && h <= 15 ? 'midday' : 'day';
}

// Tatlı su sıcaklığı tahmini: son 5 günün ortalama hava sıcaklığı (göller havayı gecikmeli izler)
function freshWaterTemp(hours, i, type) {
  const t = avg(hours.slice(Math.max(0, i - 120), i + 1).map(h => h.temp));
  if (t == null) return null;
  // Dereler (özellikle kaynak/dağ dereleri) genelde daha serin
  return type === 'river' ? Math.max(2, t - 2) : Math.max(2, t);
}

// ——— Ana fonksiyon: her saate skor ekler ———
export function scoreHours(cond, type, lat, lng, shore = null) {
  return cond.hours.map((r, i) => scoreRow(r, i, cond.hours, cond.suns, type, lat, lng, 60, shore));
}

// Tek bir zaman dilimini puanla. i: geçmişe bakış için saatlik dizideki konum, spanMin: dilim uzunluğu (dk)
export function scoreRow(r, i, hours, suns, type, lat, lng, spanMin = 60, shore = null) {
  {
    const mid = spanMin / 2;
    const reasons = [];
    let s = 4;
    let danger = false;
    const add = (v, text) => { s += v; reasons.push([v, text]); };
    const past = n => hours.slice(Math.max(0, i - n), i);

    // 1) Işık
    const light = lightPhase(r.date, suns, mid);
    if (light === 'twilight') add(type === 'sea' ? 2 : 1.8, 'Alacakaranlık: avlanma saati');
    else if (light === 'night') add(type === 'sea' ? 0.8 : 0.6, 'Gece');
    else if (light === 'midday') {
      if ((r.cloud ?? 0) >= 70) add(0.3, 'Kapalı hava, öğle güneşi yok');
      else add(-0.8, 'Öğle güneşi, balık derine çekilir');
    } else if (light === 'day' && type !== 'sea' && (r.cloud ?? 0) >= 70) add(0.5, 'Kapalı hava');

    // 2) Su sıcaklığı
    const wt = type === 'sea' ? (r.sst ?? avg(past(24).map(h => h.sst))) : freshWaterTemp(hours, i, type);
    r.waterTemp = wt;
    r.waterTempEstimated = type !== 'sea' || r.sst == null;
    if (wt != null) {
      if (type === 'sea') {
        if (wt >= 12 && wt <= 22) add(1, `Su ${wt.toFixed(0)} °C: ideal aralık`);
        else if (wt < 9) add(-0.8, `Su çok soğuk (${wt.toFixed(0)} °C)`);
        else if (wt > 26) add(-0.3, `Su çok sıcak (${wt.toFixed(0)} °C)`);
        else add(0.3, `Su ${wt.toFixed(0)} °C`);
      } else {
        if (wt >= 14 && wt <= 24) add(1.5, `Su ~${wt.toFixed(0)} °C: balık aktif`);
        else if (wt < 6) add(-1.5, `Su çok soğuk (~${wt.toFixed(0)} °C), balık uyuşuk`);
        else if (wt < 10) add(-0.5, `Su soğuk (~${wt.toFixed(0)} °C)`);
        else if (wt > 27) add(-0.5, `Su çok sıcak (~${wt.toFixed(0)} °C), oksijen az`);
        else add(0.5, `Su ~${wt.toFixed(0)} °C`);
        // Ani soğuma
        const recent = avg(hours.slice(Math.max(0, i - 48), i + 1).map(h => h.temp));
        const before = avg(hours.slice(Math.max(0, i - 120), Math.max(0, i - 48)).map(h => h.temp));
        if (recent != null && before != null && before - recent >= 4) add(-1, 'Hava aniden soğudu');
      }
    }

    // 3) Dalga (deniz)
    if (type === 'sea' && r.wave != null) {
      if (r.wave < 0.15) add(0.2, 'Deniz çarşaf, su berrak');
      else if (r.wave < 0.8) add(1, `Hafif dalga (${r.wave.toFixed(1)} m), su hareketli`);
      else if (r.wave < 1.25) add(0, `Dalga ${r.wave.toFixed(1)} m`);
      else if (r.wave < 2) add(-1.5, `Dalga yüksek (${r.wave.toFixed(1)} m)`);
      else { add(-3, `Dalga tehlikeli (${r.wave.toFixed(1)} m)`); danger = true; }
      // Fırtına sonrası bulanık su
      const maxPast = max(past(36).map(h => h.wave));
      if (maxPast != null && maxPast >= 1.5 && r.wave < 1) add(0.6, 'Fırtına sonrası bulanık su (levrek için iyi)');
    }

    // 4) Rüzgar
    if (r.wind != null) {
      if (type === 'sea') {
        if (r.wind < 5) add(0, 'Rüzgar yok');
        else if (r.wind < 20) add(0.8, 'Rüzgar hafif-orta');
        else if (r.wind < 30) add(0, 'Rüzgar orta-sert');
        else if (r.wind < 40) add(-1, 'Rüzgar sert, atış zor');
        else { add(-2.5, 'Rüzgar çok sert'); danger = true; }
      } else {
        if (r.wind < 4) add(0, 'Su ayna gibi, balık temkinli');
        else if (r.wind < 20) add(0.8, 'Hafif rüzgar, suda kırışıklık');
        else if (r.wind < 30) add(0, 'Rüzgar orta-sert');
        else { add(-1.5, 'Rüzgar sert'); if (r.wind >= 40) danger = true; }
      }
    }
    if (r.gust != null && r.gust >= 60) { add(-0.5, `Hamle ${Math.round(r.gust)} km/s`); danger = true; }

    // 5) Yağış ve fırtına
    if (r.code != null && r.code >= 95) { add(-2.5, 'Şimşek/fırtına riski'); danger = true; }
    else if (r.precip != null && r.precip >= 5) add(-1, 'Kuvvetli yağış');
    else if (type !== 'sea' && r.precip != null && r.precip >= 0.2 && r.precip < 2) add(0.4, 'Hafif yağmur');
    if (type === 'river') {
      const rain24 = sum(past(24).map(h => h.precip));
      if (rain24 >= 15) add(-1.2, 'Son 24 saatte çok yağış: dere kabarık/bulanık');
    }

    // 6) Basınç (zayıf kanıt, düşük ağırlık)
    const p3 = hours[i - 3]?.pressure, p24 = hours[i - 24]?.pressure;
    if (r.pressure != null && p24 != null && r.pressure - p24 >= 6) add(-0.6, 'Soğuk cephe sonrası basınç yükseldi');
    else if (r.pressure != null && p3 != null) {
      const d = r.pressure - p3;
      if (d <= -0.6 && d >= -2.5) add(0.4, 'Basınç yavaş düşüyor');
      else if (d < -2.5) add(-0.3, 'Basınç hızlı düşüyor');
      else if (d >= 2) add(-0.4, 'Basınç hızlı yükseliyor');
    }

    // 7) Ay (zayıf kanıt, düşük ağırlık)
    const sol = solunar(new Date(r.date.getTime() + mid * 60000), lat, lng);
    if (sol === 'major') add(0.2, 'Solunar büyük dönem (ay tepede/altta)'); // bilimsel destek zayıf → küçük ağırlık
    else if (sol === 'minor') add(0.1, 'Solunar küçük dönem (ay doğuşu/batışı)');
    const moon = moonPhase(r.date);
    if (Math.min(Math.abs(moon.age - 14.77), moon.age, 29.53 - moon.age) < 2) add(0.3, moon.name);

    const score = Math.round(Math.max(0, Math.min(10, s)) * 10) / 10;
    const w = windScore(r, i, hours, type, lat, lng, shore);
    // Birleşik puan: balık puanı + sadece rüzgar yönü/bölge etkisi
    const comboScore = Math.round(Math.max(0, Math.min(10, s + w.dir)) * 10) / 10;
    return { ...r, score, comboScore, dirNotes: w.dirNotes, windScore: w.score, windNotes: w.notes, reasons: reasons.filter(([v]) => v !== 0).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])), danger, light };
  }
}

// ——— Rüzgar puanı (0–10) — ana puandan ayrı, köşede küçük gösterilir ———
// Hız + hamle (+ denizde dalga) + yönün bölgesel etkisi:
//  • Boğaz/Marmara: sert lodos avı bozar, uzun lodos Boğaz'da yüzey akıntısını tersine çevirebilir.
//  • Göl/dere: soğuk mevsimde soğuk kuzey rüzgarı yüzeyi soğutur, ılık güney rüzgarı ısıtır;
//    uzun süre aynı yönden esen rüzgar yemi rüzgarın vurduğu kıyıda biriktirir.
const inSector = (deg, from, to) => { const d = ((deg % 360) + 360) % 360; return from <= to ? d >= from && d < to : d >= from || d < to; };
const isLodos = d => d != null && inSector(d, 202.5, 247.5);
const isNorthCold = d => d != null && inSector(d, 292.5, 67.5);   // karayel, yıldız, poyraz
const isSouthWarm = d => d != null && inSector(d, 112.5, 247.5);  // keşişleme, kıble, lodos
// Boğaz: Kadıköy/Sarayburnu'ndan Rumeli/Anadolu Feneri'ne kadar (Kilyos gibi Karadeniz kıyısı hariç)
const inBosphorus = (lat, lng) => lat >= 40.99 && lat <= 41.22 && lng >= 28.97 && lng <= 29.15;
// Marmara Denizi kıyıları (Silivri 41.07 dahil; İstanbul'un Karadeniz kıyısı 41.15+ hariç) + Boğaz
const inMarmara = (lat, lng) => (lat >= 40.2 && lat <= 41.1 && lng >= 26.4 && lng <= 29.95) || inBosphorus(lat, lng);

// Rüzgarın kıyıya göre durumu. shore: suya bakış yönü (derece, 0=K); rüzgar yönü = rüzgarın geldiği yön.
export function windRelation(windDir, shore) {
  if (windDir == null || shore == null) return null;
  const diff = Math.abs(((windDir - shore + 540) % 360) - 180);
  return diff <= 60 ? 'onshore' : diff >= 120 ? 'offshore' : 'cross';
}

export function windScore(r, i, hours, type, lat, lng, shore = null) {
  const notes = [];
  if (r.wind == null) return { score: null, notes, dir: 0, dirNotes: [] };
  let s;
  let dir = 0;            // yalnız yön/bölge etkisi (birleşik puan için; hız iki kez sayılmasın)
  const dirNotes = [];
  const w = r.wind;
  if (w < 5) { s = 5.5; notes.push('Durgun'); }
  else if (w < 20) { s = 7.5; notes.push('Hafif-orta, ideal'); }
  else if (w < 30) { s = 5; notes.push('Orta-sert'); }
  else if (w < 40) { s = type === 'sea' ? 3 : 2.5; notes.push('Sert, atış zor'); }
  else { s = 1; notes.push('Çok sert, tehlikeli'); }
  if (r.gust != null && r.gust >= 60) { s -= 1.5; notes.push(`Hamle ${Math.round(r.gust)} km/s`); }
  else if (r.gust != null && r.gust - w >= 25) { s -= 0.5; notes.push('Hamleli (ani esintiler)'); }
  if (type === 'sea' && r.wave != null) {
    if (r.wave >= 0.2 && r.wave < 0.8) s += 0.5;
    else if (r.wave >= 1.5) { s -= 1; notes.push('Dalga yüksek'); }
  }
  const month = r.date.getMonth() + 1;
  const coldSeason = month >= 10 || month <= 4;
  if (type === 'sea' && inMarmara(lat, lng) && isLodos(r.windDir) && w >= 20) {
    s -= 1.5; dir -= 1.5; notes.push('Sert lodos: Marmara/Boğaz\'da av zorlaşır'); dirNotes.push([-1.5, 'Sert lodos: Marmara/Boğaz\'da av zorlaşır']);
    if (inBosphorus(lat, lng)) {
      const last = hours.slice(Math.max(0, i - 12), i + 1);
      if (last.length >= 10 && last.every(h => isLodos(h.windDir) && h.wind >= 20)) { s -= 0.5; dir -= 0.5; notes.push('12 saattir lodos: Boğaz\'da akıntı tersine dönebilir'); dirNotes.push([-0.5, '12 saattir lodos: Boğaz\'da akıntı tersine dönebilir']); }
    }
  }
  if (type !== 'sea' && coldSeason && w >= 8) {
    if (isNorthCold(r.windDir)) { s -= 1; dir -= 1; notes.push('Soğuk kuzey rüzgarı suyu soğutur'); dirNotes.push([-1, 'Soğuk kuzey rüzgarı suyu soğutur']); }
    else if (isSouthWarm(r.windDir)) { s += 0.7; dir += 0.7; notes.push('Ilık güney rüzgarı suyu ısıtır'); dirNotes.push([0.7, 'Ilık güney rüzgarı suyu ısıtır']); }
  }
  const rel = windRelation(r.windDir, shore);
  const addDir = (v, t) => { s += v; dir += v; notes.push(t); dirNotes.push([v, t]); };
  if (rel === 'onshore' && w >= 8 && w < 30) addDir(0.6, 'Rüzgar sudan kıyınıza esiyor: yem ve balık kıyıya gelir');
  else if (rel === 'onshore' && w >= 30) addDir(type === 'sea' ? -0.5 : -0.3, 'Sert rüzgar tam kıyınıza vuruyor: dalga ve köpük, dikkat');
  else if (rel === 'offshore' && w >= 8) addDir(-0.4, 'Rüzgar arkanızdan (karadan) esiyor: yem açığa gider, kıyı suyu durgun');
  if (type !== 'sea' && w >= 8 && (rel === 'onshore' || rel == null)) {
    const last = hours.slice(Math.max(0, i - 24), i + 1).filter(h => h.windDir != null);
    const sameDir = last.length >= 20 && last.every(h => Math.abs(((h.windDir - r.windDir + 540) % 360) - 180) <= 45);
    if (sameDir) { s += 0.3; dir += 0.3; notes.push('24 saattir aynı yön: yem rüzgarın vurduğu kıyıda birikir'); dirNotes.push([0.3, '24 saattir aynı yön: yem rüzgarın vurduğu kıyıda birikir']); }
  }
  return { score: Math.round(Math.max(0, Math.min(10, s)) * 10) / 10, notes, dir, dirNotes };
}

export const scoreClass = s => s >= 6.5 ? 's-good' : s >= 4.5 ? 's-mid' : 's-bad';
export const scoreColor = s => `var(--${s >= 6.5 ? 'good' : s >= 4.5 ? 'warn' : 'bad'})`;
export const scoreLabel = (s, danger) => danger ? 'Tehlikeli, gitmeyin ⚠️'
  : s >= 8 ? 'Çok iyi, hemen çık! 🎣' : s >= 6.5 ? 'İyi görünüyor' : s >= 4.5 ? 'Fena değil' : s >= 3 ? 'Zayıf' : 'Evde kal';

export const scoreShort = (s, danger) => danger ? 'Tehlikeli' : s >= 8 ? 'Çok iyi' : s >= 6.5 ? 'İyi' : s >= 4.5 ? 'Orta' : s >= 3 ? 'Zayıf' : 'Kötü';

// Belirli bir zamana en yakın saat
export function hourAt(rows, date) {
  let best = null, bd = Infinity;
  for (const r of rows) { const d = Math.abs(r.date - date); if (d < bd) { bd = d; best = r; } }
  return bd <= 90 * 60000 ? best : null;
}
