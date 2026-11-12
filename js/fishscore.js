// Rastgele balık skoru (0–10): deniz ve tatlı su için ayrı kurallar.
//
// Ağırlıklar kanıtın gücüne göre seçildi:
//  • Su sıcaklığı: balığın metabolizmasını ve beslenmesini doğrudan belirler (en güçlü etken,
//    örn. sazan ~18 °C üstünde aktif, ~8 °C altında neredeyse beslenmez).
//  • Işık (alacakaranlık / gece / öğle güneşi): yırtıcıların avlanma saatleri, kıyı balıkçılığında en tutarlı gözlem.
//  • Dalga ve rüzgar: hafif dalga suyu bulandırıp levreği kıyıya yaklaştırır; yüksek dalga avı düşürür ve tehlikelidir.
//  • Fırtına sonrası bulanık su, yağış, dere kabarması.
//  • Basınç ve ay (solunar): bilimsel kanıtı zayıf, bu yüzden düşük ağırlıkla eklendi.
//
// Ölçek: sık görülen "normal" şartlar (ılık su, hafif rüzgar, hafif dalga) küçük artı verir, böylece sıradan bir
// saat "Orta" (≈5–6) kalır. Yeşil (≥6.5) için güçlü etkenlerin bir araya gelmesi gerekir: alacakaranlık,
// fırtına sonrası bulanık su, en uygun su sıcaklığı gibi. (Bir yıllık benzetimde saatlerin denizde ~%19'u, gölde ~%12'si yeşil,
// bunların çoğu alacakaranlık; "Çok iyi" ≈ %2.)

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

// Güneşin öğle yüksekliği (derece): 90 − |enlem − güneşin dik açısı|
export function noonElevation(date, lat) {
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  return 90 - Math.abs(lat - decl);
}

// Işık evresi. "Öğle": güneşin gerçek tepe saati (doğuş–batış ortası) ±2 saat ve güneş yeterince yüksek
// (kışın güneş alçakta, ~25°: öğle güneşi balığı derine itmez).
// Alacakaranlık ağırlığı (0–1). Karanlık tarafta (batıştan sonra / doğuştan önce) hava hızla kararır:
// yarım saate kadar tam, 1 saatte biter. Aydınlık tarafta (batıştan önce / doğuştan sonra) ışık yavaş azalır:
// 1 saate kadar tam, 1,5 saatte biter.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const twWeight = d => (d >= 0 ? clamp((1 - d) / 0.5, 0, 1) : clamp((1.5 + d) / 0.5, 0, 1)); // d: karanlık tarafa doğru saat
// Dönen: { phase: etiket (türler için), base: alacakaranlık dışındaki evre, tw: alacakaranlık ağırlığı }
function lightInfo(date, suns, midMin = 30, lat = 41) {
  const sun = suns.find(s => s.rise.toDateString() === date.toDateString());
  if (!sun) return null;
  const t = date.getTime() + midMin * 60000; // zaman diliminin ortası
  const tw = Math.max(twWeight((sun.rise.getTime() - t) / 3600e3), twWeight((t - sun.set.getTime()) / 3600e3));
  const noon = (sun.rise.getTime() + sun.set.getTime()) / 2;
  const base = t < sun.rise.getTime() || t > sun.set.getTime() ? 'night'
    : Math.abs(t - noon) <= 2 * 3600e3 && noonElevation(date, lat) >= 35 ? 'midday' : 'day';
  return { phase: tw >= 0.5 ? 'twilight' : base, base, tw };
}
// Parçalı doğrusal eğri: [[x, y], ...] (basamak yerine yumuşak geçiş)
function curve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
}
const r1 = v => Math.round(v * 10) / 10;
// Göl suyu sıcaklığının puana etkisi (sazan, kızılkanat gibi ılık su balıkları: 17–26 °C en iyi, 29'a kadar beslenir)
const LAKE_TEMP = [[4, -1.5], [8, -0.5], [12, 0], [17, 1], [26, 1], [29, 0], [31, -0.5]];

// ——— Tatlı su sıcaklığı tahmini ———
// Göl büyüklüğü: küçük (gölet, sığ) havaya birkaç günde, büyük/derin göl haftalarca geriden yetişir.
export const LAKE_SIZES = {
  small: { label: 'Küçük (gölet, sığ)', tau: 4, bonus: 2.5 },
  medium: { label: 'Orta', tau: 10, bonus: 2.5 },
  large: { label: 'Büyük / derin', tau: 25, bonus: 2.5 },
};
// Bilinen göller (derinlik ve büyüklüğe göre)
const KNOWN_LAKES = [
  ['large', ['sapanca', 'iznik', 'omerli', 'egirdir', 'hazar']],
  ['medium', ['terkos', 'durusu', 'buyukcekmece', 'kucukcekmece', 'alibey', 'sazlidere', 'elmali', 'darlik', 'uluabat', 'manyas', 'kusgolu', 'beysehir', 'aksehir', 'poyrazgolu', 'efteni', 'yenicaga', 'abant', 'mogan', 'eymir', 'cubuk', 'gokcekaya', 'cildir', 'karamik', 'akgol']],
];
const norm = s => (s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[^a-z]/g, '');
// Hangi büyüklük? Elle seçildiyse o, sonra bilinen göller, sonra haritadan ölçülen alan, yoksa orta.
export function lakeSizeFor(place, guess) {
  if (LAKE_SIZES[place?.lakeSize]) return { size: place.lakeSize, source: 'manual' };
  // Önce haritadaki gölün adı, sonra ölçülen alan; meranın kendi adı en son (köy/ilçe adı göl sanılmasın).
  // Tam kelime aranır: "Çubuklu" ≠ "Çubuk".
  const known = name => {
    const words = (name || '').split(/[^\p{L}]+/u).map(norm).filter(Boolean);
    const joined = words.join('');
    for (const [size, list] of KNOWN_LAKES) if (list.some(x => words.includes(x) || (x.length >= 8 && joined.includes(x)))) return size;
    return null;
  };
  const k1 = known(guess?.name);
  if (k1) return { size: k1, source: 'known' };
  if (LAKE_SIZES[guess?.size]) return { size: guess.size, source: 'auto', areaKm2: guess.areaKm2 };
  const k2 = known(place?.name);
  if (k2) return { size: k2, source: 'known' };
  return { size: 'medium', source: 'default' };
}

// Son 60 günün günlük hava ortalamasından su sıcaklığı modeli.
//  • Göl: hava sıcaklığının gecikmeli (üstel) ortalaması — gecikme göl büyüdükçe artar —
//    + yazın güneşin yüzeyi ısıtması (Nisan–Eylül). Göl yüzeyi 4 °C'nin altına inmez.
//  • Dere: hava son ~3 günü izler ama uçlara gitmez (kaynak suyu yazın serin, kışın ılık tutar).
export function waterModel(air, type, size = 'medium') {
  if (!air?.days || type === 'sea') return null;
  const L = LAKE_SIZES[size] || LAKE_SIZES.medium;
  const tau = type === 'river' ? 3 : L.tau;
  const first = air.t.slice(0, 7).filter(v => v != null);
  let e = first.length ? first.reduce((a, b) => a + b, 0) / first.length : null;
  const vals = air.days.map((d, i) => {
    if (air.t[i] != null) e = e == null ? air.t[i] : e + (air.t[i] - e) / tau;
    if (e == null) return null;
    if (type === 'river') return Math.max(1, 11 + 0.75 * (e - 11));
    const [y, m, dd] = d.split('-').map(Number);
    const doy = Math.floor((new Date(y, m - 1, dd) - new Date(y, 0, 0)) / 864e5);
    const sun = L.bonus * Math.max(0, Math.sin(Math.PI * (doy - 100) / 180));
    return Math.max(4, e + sun);
  });
  const idx = new Map(air.days.map((d, i) => [d, i]));
  const dayKey = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return {
    size, tau,
    // Gün ortası değerleri arasında ara değer (gece yarısı sıçrama olmasın)
    at(dt) {
      const i = idx.get(dayKey(dt));
      if (i == null || vals[i] == null) return null;
      const f = (dt.getHours() + dt.getMinutes() / 60) / 24 - 0.5;
      const j = f >= 0 ? i + 1 : i - 1;
      const o = vals[j];
      return o == null ? vals[i] : vals[i] + (o - vals[i]) * Math.abs(f);
    },
  };
}

// Model yoksa (veri gelmediyse) eski yöntem: son 5 günün ortalaması
function freshWaterTemp(hours, i, type, env, date) {
  const m = env?.model?.at(date);
  if (m != null) return m;
  const t = avg(hours.slice(Math.max(0, i - 120), i + 1).map(h => h.temp));
  if (t == null) return null;
  if (type === 'river') return Math.max(1, 11 + 0.75 * (t - 11));
  // Modelle aynı yaz güneşi terimi (yedek yol ile model arasında puan oynamasın)
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  return Math.max(4, t + (LAKE_SIZES[env?.size] || LAKE_SIZES.medium).bonus * Math.max(0, Math.sin(Math.PI * (doy - 100) / 180)));
}

// Aynı olayın (fırtına: rüzgar + dalga + lodos) üst üste cezalandırılmaması:
// en büyük ceza tam, diğeri %30 sayılır.
const joinNeg = (a, b) => (a < 0 && b < 0 ? Math.min(a, b) + 0.3 * Math.max(a, b) : Math.min(a, 0) + Math.min(b, 0));

// ——— Ana fonksiyon: her saate skor ekler ———
// env: { model: waterModel(...), size } — tatlı su sıcaklığı ve göl büyüklüğü
export function scoreHours(cond, type, lat, lng, shore = null, env = null) {
  return cond.hours.map((r, i) => scoreRow(r, i, cond.hours, cond.suns, type, lat, lng, 60, shore, env));
}

// Tek bir zaman dilimini puanla. i: geçmişe bakış için saatlik dizideki konum, spanMin: dilim uzunluğu (dk)
export function scoreRow(r, i, hours, suns, type, lat, lng, spanMin = 60, shore = null, env = null) {
  {
    const mid = spanMin / 2;
    const reasons = [];
    let s = 4;
    let danger = false;
    const add = (v, text) => { s += v; reasons.push([v, text]); };
    const past = n => hours.slice(Math.max(0, i - n), i);

    // 1) Işık. Alacakaranlık keskin bir sınır değil: batıştan sonra yarım saat tam, 1 saatte biter;
    //    batıştan önce 1 saat tam, 1,5 saatte başlar (doğuşta tersi).
    const li = lightInfo(r.date, suns, mid, lat);
    const light = li?.phase ?? null;
    const wt = type === 'sea' ? (r.sst ?? avg(past(24).map(h => h.sst))) : freshWaterTemp(hours, i, type, env, r.date);
    if (li) {
      const cloudy = clamp(((r.cloud ?? 0) - 50) / 30, 0, 1);       // %50'den %80'e kapanır
      const overcast = (type === 'sea' ? 0.3 : 0.5) * cloudy;
      // Tatlı su: sazan, kızılkanat, levrek, turna, alabalık gündüz de beslenir (dip ve şamandıra avı gündüz yapılır).
      // Soğuk suda (< 12 °C) güneşli gündüz sığlığı ısıtır: balık öğle–öğleden sonra daha aktif.
      const lake = type !== 'sea'; // göl ve dere (tatlı su balıkları)
      const coldSun = lake && wt != null && wt < 12 ? 0.5 * (1 - cloudy) : 0;
      const sunPen = lake ? (coldSun ? 0 : noonElevation(r.date, lat) >= 50 ? -0.3 : 0) : (noonElevation(r.date, lat) >= 50 ? -0.8 : -0.4);
      const dayBase = lake ? Math.max(0.3, overcast) + coldSun : overcast;
      const base = li.base === 'night' ? (type === 'sea' ? 0.5 : 0.3)
        // Öğle: açık havada güneş cezası (varsa), bulut arttıkça gündüz değerine yaklaşır
        : li.base === 'midday' ? (sunPen < 0 ? sunPen + (dayBase - sunPen) * cloudy : dayBase) : dayBase;
      const tw = li.tw;
      const pts = r1(base + tw * ((type === 'sea' ? 2 : 1.8) - base));
      add(pts, tw >= 0.95 ? 'Alacakaranlık: avlanma saati' : tw > 0 ? 'Alacakaranlığa yakın'
        : li.base === 'night' ? 'Gece' : pts < 0 ? 'Öğle güneşi, balık derine çekilir'
        : coldSun && pts >= 0.5 ? 'Soğuk suda güneşli gündüz: sığlık ısınır, balık hareketlenir'
        : lake ? (cloudy > 0.5 ? 'Kapalı hava, gündüz beslenme' : 'Gündüz: tatlı su balığı beslenir') : 'Kapalı hava');
    }

    // 2) Su sıcaklığı
    const waterTemp = wt, waterTempEstimated = type !== 'sea' || r.sst == null;
    let cooled = false;
    if (wt != null) {
      if (type === 'sea') {
        if (wt >= 14 && wt <= 21) add(0.6, `Su ${wt.toFixed(0)} °C: ideal aralık`);
        else if (wt < 7) add(-0.5, `Su çok soğuk (${wt.toFixed(1)} °C)`); // kış levreği/mezgit 7–9 °C'de de avlanır
        else if (wt > 26) add(-0.3, `Su çok sıcak (${wt.toFixed(0)} °C)`);
        else add(0, `Su ${wt.toFixed(0)} °C`);
      } else {
        if (type === 'lake') {
          const v = r1(curve(LAKE_TEMP, wt));
          add(v, v >= 0.7 ? `Su ~${wt.toFixed(0)} °C: balık aktif` : v <= -1 ? `Su çok soğuk (~${wt.toFixed(0)} °C), balık uyuşuk`
            : v < 0 ? (wt < 12 ? `Su soğuk (~${wt.toFixed(0)} °C)` : `Su çok sıcak (~${wt.toFixed(0)} °C)`) : `Su ~${wt.toFixed(0)} °C: ılıyor`);
        } else if (wt >= 16 && wt <= 22) add(1, `Su ~${wt.toFixed(0)} °C: balık aktif`);
        else if (wt < 6) add(-1.5, `Su çok soğuk (~${wt.toFixed(0)} °C), balık uyuşuk`);
        else if (wt < 10) add(-0.5, `Su soğuk (~${wt.toFixed(0)} °C)`);
        else if (wt > 24) add(-0.5, `Su ılık (~${wt.toFixed(0)} °C), oksijen azalır`);
        else add(0, `Su ~${wt.toFixed(0)} °C`);
        // Ani soğuma: su modeli soğumayı zaten kısmen gösterir; kıyı sığlığı için küçük ek ceza
        const recent = avg(hours.slice(Math.max(0, i - 48), i + 1).map(h => h.temp));
        const before = avg(hours.slice(Math.max(0, i - 120), Math.max(0, i - 48)).map(h => h.temp));
        if (i >= 96 && recent != null && before != null && before - recent >= 4 && wt < 24) { cooled = true; add(-0.5, 'Hava aniden soğudu, kıyı suyu serinler'); }
      }
    }

    // 3) Dalga (deniz). Ceza aşağıda rüzgarla birlikte "deniz durumu" olarak eklenir (aynı fırtına iki kez sayılmasın).
    // Basamak yok: 1 m'den sonra ceza yavaş yavaş artar.
    let waveNeg = 0, waveNegText = '';
    if (type === 'sea' && r.wave != null) {
      if (r.wave < 0.15) add(0.2, 'Deniz çarşaf, su berrak');
      else if (r.wave < 1) add(r1(0.5 * clamp((1 - r.wave) / 0.2, 0, 1)), `Hafif dalga (${r.wave.toFixed(1)} m), su hareketli`);
      else { waveNeg = -r1(Math.min(3, (r.wave - 1) * 3)); waveNegText = r.wave >= 2 ? `Dalga tehlikeli (${r.wave.toFixed(1)} m)` : `Dalga yüksek (${r.wave.toFixed(1)} m)`; }
      if (r.wave >= 2) danger = true;
      // Fırtına sonrası bulanık su
      const maxPast = max(past(36).map(h => h.wave));
      const murky = r1(0.8 * clamp((1.2 - r.wave) / 0.4, 0, 1));
      if (maxPast != null && maxPast >= 1.5 && murky > 0) add(murky, 'Fırtına sonrası bulanık su (levrek için iyi)');
    }

    // 4) Rüzgar (25 km/s'ten sonra ceza yavaş yavaş artar)
    let seaNeg = waveNeg;
    if (r.wind == null && waveNeg) add(waveNeg, waveNegText);
    if (r.wind != null) {
      if (type === 'sea') {
        const windNeg = r.wind < 25 ? 0 : -r1(Math.min(2.5, (r.wind - 25) / 6));
        const windNegText = r.wind >= 40 ? 'Rüzgar çok sert' : windNeg ? 'Rüzgar sert, atış zor' : '';
        if (r.wind >= 5 && r.wind < 20) add(0.3, 'Rüzgar hafif-orta');
        if (r.wind >= 40) danger = true;
        seaNeg = joinNeg(waveNeg, windNeg);
        if (seaNeg) add(r1(seaNeg), [windNegText, waveNegText].filter(Boolean).join(' · '));
      } else {
        if (r.wind >= 4 && r.wind < 20) add(0.3, 'Hafif rüzgar, suda kırışıklık');
        else if (r.wind >= 25) { seaNeg = -r1(Math.min(1.5, (r.wind - 25) * 0.15)); add(seaNeg, 'Rüzgar sert'); }
        if (r.wind >= 40) danger = true;
      }
    }
    if (r.gust != null && r.gust >= 60) { danger = true; if (seaNeg > -0.5) add(-0.5, `Hamle ${Math.round(r.gust)} km/s`); }

    // 5) Yağış ve fırtına
    if (r.code != null && r.code >= 95) { add(-2.5, 'Şimşek/fırtına riski'); danger = true; }
    else if (r.precip != null && r.precip >= 5) add(-1, 'Kuvvetli yağış');
    let flood = 0;
    if (type === 'river') {
      // Dere yağışı günlerce taşır: son 24 saat tam, önceki iki gün yarım sayılır
      flood = sum(hours.slice(Math.max(0, i - 23), i + 1).map(h => h.precip)) + 0.5 * sum(hours.slice(Math.max(0, i - 71), Math.max(0, i - 23)).map(h => h.precip));
      if (flood >= 40) { add(-2.5, 'Çok yağış: sel / ani kabarma riski, dere kenarından uzak durun'); danger = true; }
      else if (flood >= 15) add(-1.2, 'Son günlerde çok yağış: dere kabarık/bulanık');
      else if (flood >= 8) add(-0.5, 'Yağış sonrası su biraz bulanık');
    }
    if (type !== 'sea' && !(r.code >= 95) && r.precip != null && r.precip >= 0.2 && r.precip < 2 && flood < 8) add(0.4, 'Hafif yağmur');

    // 6) Basınç (zayıf kanıt, düşük ağırlık)
    const p3 = hours[i - 3]?.pressure, p24 = hours[i - 24]?.pressure;
    if (r.pressure != null && p24 != null && r.pressure - p24 >= 6) { if (!cooled) add(-0.6, 'Soğuk cephe sonrası basınç yükseldi'); } // cephe bir kez sayılır
    else if (r.pressure != null && p3 != null) {
      const d = r.pressure - p3;
      if (d <= -1 && d >= -2.5) add(0.4, 'Basınç yavaş düşüyor'); // -1: günlük doğal basınç dalgası (±0.5 hPa) sayılmasın
      else if (d < -2.5) add(-0.3, 'Basınç hızlı düşüyor');
      else if (d >= 2) add(-0.4, 'Basınç hızlı yükseliyor');
    }

    // 7) Ay (zayıf kanıt, düşük ağırlık)
    const sol = solunar(new Date(r.date.getTime() + mid * 60000), lat, lng);
    if (sol === 'major') add(0.2, 'Solunar büyük dönem (ay tepede/altta)'); // bilimsel destek zayıf → küçük ağırlık
    else if (sol === 'minor') add(0.1, 'Solunar küçük dönem (ay doğuşu/batışı)');
    const moon = moonPhase(r.date);
    if (Math.min(Math.abs(moon.age - 14.77), moon.age, 29.53 - moon.age) < 2) add(0.3, moon.name);

    // Tehlikeli saat hiçbir zaman iyi görünmez: puan en fazla 2.9 (kırmızı)
    const cap = v => r1(Math.max(0, Math.min(danger ? 2.9 : 10, v)));
    const score = cap(s);
    const air24 = avg(hours.slice(Math.max(0, i - 23), i + 1).map(h => h.temp));
    const w = windScore(r, i, hours, type, lat, lng, shore, { dT: wt != null && air24 != null ? air24 - wt : null, cooled });
    // Birleşik puan: balık puanı + sadece rüzgar yönü/bölge etkisi
    // Yön/bölge cezası (ör. sert lodos) deniz durumu cezasıyla birlikte: aynı fırtına üçüncü kez tam sayılmaz
    const dirAdj = w.dir < 0 && seaNeg < 0 ? joinNeg(seaNeg, w.dir) - seaNeg : w.dir;
    const comboScore = cap(s + dirAdj);
    return { ...r, waterTemp, waterTempEstimated, score, comboScore, dirNotes: w.dirNotes, windScore: w.score, windNotes: w.notes, reasons: reasons.filter(([v]) => v !== 0).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])), danger, light };
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
const inBosphorus = (lat, lng) => lat >= 40.99 && lat <= 41.24 && lng >= 28.97 && lng <= 29.16;
// Marmara Denizi kıyıları (Silivri 41.07 dahil; İstanbul'un Karadeniz kıyısı 41.15+ hariç) + Boğaz
// Saros Körfezi (Ege) hariç
const inMarmara = (lat, lng) => (lat >= 40.2 && lat <= 41.1 && lng >= 26.4 && lng <= 29.95 && !(lng < 26.95 && lat > 40.45)) || inBosphorus(lat, lng);

// Rüzgarın kıyıya göre durumu. shore: suya bakış yönü (derece, 0=K); rüzgar yönü = rüzgarın geldiği yön.
export function windRelation(windDir, shore) {
  if (windDir == null || shore == null) return null;
  const diff = Math.abs(((windDir - shore + 540) % 360) - 180);
  return diff <= 60 ? 'onshore' : diff >= 120 ? 'offshore' : 'cross';
}

// opts.dT: son 24 saatin hava ortalaması − su sıcaklığı; opts.cooled: ani soğuma zaten sayıldı
export function windScore(r, i, hours, type, lat, lng, shore = null, opts = {}) {
  const notes = [];
  if (r.wind == null) return { score: null, notes, dir: 0, dirNotes: [] };
  let s;
  let dir = 0;            // yalnız yön/bölge etkisi (birleşik puan için; hız iki kez sayılmasın)
  const dirNotes = [];
  const w = r.wind;
  const calm = type === 'sea' ? 5 : 4; // balık puanıyla aynı eşik
  if (w < calm) { s = 5.5; notes.push('Durgun, su ayna gibi'); }
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
  const addDir = (v, t) => { s += v; dir += v; notes.push(t); dirNotes.push([v, t]); };
  let lodos = false;
  if (type === 'sea' && inMarmara(lat, lng) && isLodos(r.windDir) && w > 15) {
    // 15 km/s'te başlar, 30'da tam (basamak yok)
    lodos = true;
    addDir(-r1(1.5 * clamp((w - 15) / 15, 0, 1)), 'Lodos: Marmara/Boğaz\'da av zorlaşır');
    if (inBosphorus(lat, lng)) {
      const last = hours.slice(Math.max(0, i - 12), i + 1);
      const south = d => d != null && inSector(d, 157.5, 247.5); // kıble + lodos
      if (last.length >= 10 && last.every(h => south(h.windDir) && h.wind >= 30)) addDir(-0.5, '12 saattir sert güney rüzgarı: Boğaz\'da akıntı tersine dönebilir');
    }
  }
  // Göl/dere: rüzgarın yönü değil, havanın sudan gerçekten soğuk/ılık olması önemli
  const dT = opts.dT;
  if (type !== 'sea' && w >= 8 && dT != null) {
    if (dT <= -3 && isNorthCold(r.windDir)) addDir(opts.cooled ? -0.3 : -1, 'Soğuk rüzgar suyu soğutur');
    else if (dT >= 2 && w < 30 && isSouthWarm(r.windDir)) addDir(0.7, 'Ilık rüzgar suyu ısıtır');
  }
  const rel = windRelation(r.windDir, shore);
  // Lodos cezası verildiyse kıyı yönü ayrıca sayılmaz (kuytu kıyı, rüzgar alan kıyıdan kötü çıkmasın)
  if (!lodos) {
    // Yem ve balığı kıyıya taşıyan, belirgin ve sürekli rüzgardır; hafif esinti değil
    if (rel === 'onshore' && w >= 15 && w < 30) addDir(0.4, 'Rüzgar sudan kıyınıza esiyor: yem ve balık kıyıya gelir');
    else if (rel === 'onshore' && w >= 30) addDir(type === 'sea' ? -0.5 : -0.3, 'Sert rüzgar tam kıyınıza vuruyor: dalga ve köpük, dikkat');
    else if (rel === 'offshore' && w >= 8) addDir(-0.4, 'Rüzgar arkanızdan (karadan) esiyor: yem açığa gider, kıyı suyu durgun');
  }
  if (type !== 'sea' && w >= 15 && w < 30 && rel === 'onshore') {
    const last = hours.slice(Math.max(0, i - 24), i + 1).filter(h => h.windDir != null);
    const sameDir = last.length >= 20 && last.every(h => Math.abs(((h.windDir - r.windDir + 540) % 360) - 180) <= 45);
    if (sameDir) addDir(0.3, '24 saattir aynı yön: yem rüzgarın vurduğu kıyıda birikir');
  }
  return { score: Math.round(Math.max(0, Math.min(10, s)) * 10) / 10, notes, dir, dirNotes };
}

export const scoreClass = s => s >= 6.5 ? 's-good' : s >= 4.5 ? 's-mid' : 's-bad';
export const scoreColor = s => `var(--${s >= 6.5 ? 'good' : s >= 4.5 ? 'warn' : 'bad'})`;
export const scoreLabel = (s, danger) => danger ? 'Tehlikeli, gitmeyin ⚠️'
  : s >= 7.5 ? 'Çok iyi, hemen çık! 🎣' : s >= 6.5 ? 'İyi görünüyor' : s >= 4.5 ? 'Orta, fena değil' : s >= 3 ? 'Zayıf' : 'Kötü, evde kal';

export const scoreShort = (s, danger) => danger ? 'Tehlikeli' : s >= 7.5 ? 'Çok iyi' : s >= 6.5 ? 'İyi' : s >= 4.5 ? 'Orta' : s >= 3 ? 'Zayıf' : 'Kötü';

// Belirli bir zamana en yakın saat
export function hourAt(rows, date) {
  let best = null, bd = Infinity;
  for (const r of rows) { const d = Math.abs(r.date - date); if (d < bd) { bd = d; best = r; } }
  return bd <= 90 * 60000 ? best : null;
}
