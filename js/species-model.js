// Türlere göre tahmin + öneri metni + ay doğuş/batış.
import { moonPosition } from './fishscore.js';
import { windName } from './weather.js';

// best: en verimli aylar, ok: avlanabilir aylar (1–12)
// temp: [min, optMin, optMax, max] su sıcaklığı (°C)
// light: hangi ışıkta daha aktif (twilight, night, day, midday)
// waves: 'likes' (hafif dalga/bulanık su sever), 'calm' (sakin, berrak su ister), null
export const SPECIES_MODEL = [
  // ——— Deniz (Marmara) ———
  { name: 'Levrek', water: ['sea'], best: [10, 11, 12, 1, 2, 3], ok: [4, 9], temp: [7, 10, 20, 26], light: ['twilight', 'night'], waves: 'likes',
    bait: 'silikon, rapala veya karides', method: 'spin ya da LRF' },
  { name: 'İstavrit', water: ['sea'], best: [9, 10, 11, 12, 1, 2], ok: [3, 4, 5, 6, 7, 8], temp: [9, 12, 22, 27], light: ['twilight', 'night'], waves: null,
    bait: 'çapari, tavuk veya karides', method: 'çapari (ışıklı iskele altı)' },
  { name: 'Lüfer', water: ['sea'], best: [9, 10, 11, 12], ok: [1, 8], temp: [11, 14, 22, 26], light: ['twilight', 'day'], waves: 'likes',
    bait: 'rapala, kaşık veya canlı istavrit', method: 'spin / sırtı (20 cm altı yasak)' },
  { name: 'Palamut', water: ['sea'], best: [9, 10, 11], ok: [8, 12], temp: [13, 15, 22, 26], light: ['day', 'twilight'], waves: null,
    bait: 'kaşık veya rapala', method: 'uzak atış spin' },
  { name: 'Çipura', water: ['sea'], best: [6, 7, 8, 9, 10, 11], ok: [5, 12], temp: [12, 16, 26, 29], light: ['day', 'twilight'], waves: 'calm',
    bait: 'midye, karides veya yengeç', method: 'dip takımı' },
  { name: 'Karagöz', water: ['sea'], best: [11, 12, 1, 2, 3, 4], ok: [5, 6, 7, 8, 9, 10], temp: [9, 12, 22, 27], light: ['night', 'twilight'], waves: 'likes',
    bait: 'karides veya midye', method: 'dip takımı / şamandıra (taş dipleri)' },
  { name: 'Kefal', water: ['sea'], best: [3, 4, 5, 9, 10, 11], ok: [1, 2, 6, 7, 8, 12], temp: [8, 12, 26, 30], light: ['day', 'twilight'], waves: 'calm',
    bait: 'ekmek içi veya hamur', method: 'şamandıra + yemleme' },
  { name: 'İskorpit', water: ['sea'], best: [10, 11, 12, 1, 2, 3, 4], ok: [5, 6, 7, 8, 9], temp: [8, 10, 22, 26], light: ['night'], waves: null,
    bait: 'karides veya balık parçası', method: 'LRF / dip (dikenlere dikkat)' },
  { name: 'Kalamar', water: ['sea'], best: [10, 11, 12, 1, 2], ok: [3, 9], temp: [10, 12, 18, 22], light: ['night', 'twilight'], waves: 'calm',
    bait: 'egi (kalamar zokası)', method: 'ışıklı iskelede zokalama' },
  { name: 'Mırmır', water: ['sea'], best: [6, 7, 8, 9], ok: [5, 10], temp: [15, 18, 26, 29], light: ['night', 'twilight'], waves: null,
    bait: 'kum kurdu veya karides', method: 'surf / dip (kumluk)' },
  { name: 'Mezgit', water: ['sea'], best: [12, 1, 2, 3], ok: [11, 4], temp: [6, 8, 14, 18], light: ['night', 'twilight', 'day'], waves: null,
    bait: 'karides veya kurt', method: 'dip takımı (derin su)' },
  // ——— Tatlı su ———
  { name: 'Sazan', water: ['lake', 'river'], best: [5, 6, 7, 8, 9], ok: [4, 10], temp: [8, 15, 26, 30], light: ['twilight', 'night'], waves: null,
    bait: 'mısır, hamur veya boilie', method: 'dip takımı (method feeder)' },
  { name: 'Kızılkanat', water: ['lake', 'river'], best: [4, 5, 6, 9, 10], ok: [3, 7, 8, 11], temp: [8, 14, 24, 28], light: ['day', 'twilight'], waves: null,
    bait: 'ekmek, kurtçuk veya mısır', method: 'şamandıra' },
  { name: 'Tatlısu kefali', water: ['river', 'lake'], best: [4, 5, 6, 9, 10], ok: [3, 7, 8, 11], temp: [6, 12, 22, 27], light: ['day', 'twilight'], waves: null,
    bait: 'ekmek, kurtçuk veya küçük kaşık', method: 'şamandıra / hafif spin' },
  { name: 'Yayın', water: ['lake', 'river'], best: [6, 7, 8, 9], ok: [5, 10], temp: [14, 20, 28, 31], light: ['night', 'twilight'], waves: null,
    bait: 'canlı yem, solucan veya tavuk ciğeri', method: 'kalın dip takımı (gece)' },
  { name: 'Alabalık', water: ['river', 'lake'], best: [3, 4, 5, 10, 11], ok: [6, 9], temp: [4, 8, 16, 20], light: ['twilight', 'day'], waves: null,
    bait: 'kaşık, solucan veya sinek', method: 'hafif spin / sinek (akıntılı, serin su)' },
  { name: 'Turna', water: ['lake', 'river'], best: [9, 10, 11, 12], ok: [1, 2, 6, 7, 8], temp: [4, 10, 20, 25], light: ['day', 'twilight'], waves: null,
    bait: 'kaşık, rapala veya silikon', method: 'spin (sazlık kenarları)' },
  { name: 'Sudak / tatlısu levreği', water: ['lake', 'river'], best: [9, 10, 11, 12, 1], ok: [2, 6, 7, 8], temp: [5, 10, 22, 27], light: ['twilight', 'night'], waves: null,
    bait: 'silikon veya canlı yem', method: 'dipten yavaş spin' },
];

// Bir saat için tür skorları (genel skor + türe özel düzeltmeler)
export function speciesScores(r, type) {
  const month = r.date.getMonth() + 1;
  return SPECIES_MODEL.filter(sp => sp.water.includes(type)).map(sp => {
    let adj = 0;
    const notes = [];
    if (sp.best.includes(month)) { adj += 1; notes.push('sezonu'); }
    else if (!sp.ok.includes(month)) { adj -= 2; notes.push('sezon dışı'); }
    const wt = r.waterTemp;
    if (wt != null) {
      const [mn, lo, hi, mx] = sp.temp;
      if (wt >= lo && wt <= hi) { adj += 1; notes.push('su ideal'); }
      else if (wt < mn || wt > mx) { adj -= 2; notes.push(wt < mn ? 'su soğuk' : 'su sıcak'); }
    }
    if (r.light) {
      // Öğle, gündüz balığı için "saati"dir (öğle cezası genel puanda zaten var)
      const L = r.light === 'midday' ? 'day' : r.light;
      if (sp.light.includes(L)) adj += r.light === 'midday' ? 0 : 0.5;
      else { adj -= 0.7; notes.push('saati değil'); }
    }
    if (type === 'sea' && r.wave != null) {
      if (sp.waves === 'likes' && r.wave >= 0.3 && r.wave <= 1.2) { adj += 0.7; notes.push('dalga iyi'); }
      if (sp.waves === 'calm' && r.wave > 0.6) { adj -= 0.8; notes.push('su fazla dalgalı'); }
    }
    // Artılar tavana yaklaştıkça küçülür: iyi günde bütün türler 10'da toplanmasın
    const raw = r.score + (adj > 0 ? adj * (10 - r.score) / 6 : adj);
    return { ...sp, raw, score: Math.round(Math.max(0, Math.min(r.danger ? 2.9 : 10, raw)) * 10) / 10, notes };
  }).sort((a, b) => b.raw - a.raw);
}

// Bir günün en iyi zaman aralığı (en yüksek skora yakın ardışık saatler)
// Tehlikeli saatler hiç önerilmez; val: hangi puanla (balık / balık+rüzgar) seçileceği
export function bestWindow(dayRows, val = r => r.score) {
  const safe = dayRows.filter(r => !r.danger);
  if (!safe.length) return null;
  const top = safe.reduce((b, r) => (val(r) > val(b) ? r : b));
  const i = dayRows.indexOf(top);
  let a = i, b = i;
  const ok = r => !r.danger && val(r) >= val(top) - 0.6;
  while (a > 0 && ok(dayRows[a - 1])) a--;
  while (b < dayRows.length - 1 && ok(dayRows[b + 1])) b++;
  return { from: dayRows[a].date, to: new Date(dayRows[b].date.getTime() + 3600e3), score: val(top), peak: top };
}

const hm = d => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// İnsan gibi konuşan öneri metni
export function adviceText({ dayRows, sel, type, place, val = r => r.score }) {
  const win = bestWindow(dayRows, val);
  if (!win) return dayRows.length ? ['⚠️ <b>Bugün kalan saatlerin hepsinde tehlikeli şartlar var</b> (sert rüzgar, yüksek dalga, fırtına ya da sel riski). Başka bir gün seçin.'] : [];
  const out = [];
  const peak = win.peak;
  const sp = speciesScores(peak, type).slice(0, 2);
  out.push(`🕐 En iyi zaman <b>${hm(win.from)}–${hm(win.to)}</b> arası (skor ${win.score.toFixed(1)}).`);
  if (sp.length) {
    out.push(`🐟 O saatlerde en olası türler: <b>${sp.map(s => s.name).join(' ve ')}</b>. ` +
      `${sp[0].name} için ${sp[0].bait} ile ${sp[0].method} deneyin.`);
  }
  if (peak.windDir != null && peak.wind >= 5) {
    const w = `${windName(peak.windDir, true)} (${Math.round(peak.wind)} km/s)`;
    if (type === 'sea') {
      out.push(`💨 O saatlerde rüzgar ${w}. Uzak atış için rüzgarı arkanıza alın. Levrek ve karagöz için rüzgarın vurduğu, köpüklü kıyı daha verimli olur.`);
    } else {
      out.push(`💨 O saatlerde rüzgar ${w}. Rüzgarın vurduğu kıyıya yem ve küçük balık toplanır; yırtıcılar oraya gelir.`);
    }
  } else out.push('💨 Rüzgar çok hafif; su durgun ve berrak olacağı için ince misina ve doğal renkli yemler kullanın.');
  if (peak.waterTemp != null) {
    const t = peak.waterTemp;
    if (t < 10) out.push(`🌡️ Su soğuk (~${t.toFixed(0)} °C): balık yavaş, yemi yavaş toplayın ve dibe yakın çalışın.`);
    else if (t > 25) out.push(`🌡️ Su çok sıcak (~${t.toFixed(0)} °C): gündüz yerine sabaha karşı ve gece daha verimli.`);
  }
  if (type === 'river') {
    const rain = dayRows.reduce((a, r) => a + (r.precip || 0), 0);
    if (rain > 10) out.push('🌧️ Gün içinde çok yağış var; dere kabarabilir, kıyıda dikkatli olun.');
  }
  if (dayRows.some(r => r.danger)) {
    const d = dayRows.filter(r => r.danger);
    out.push(`⚠️ <b>Dikkat:</b> ${hm(d[0].date)}–${hm(new Date(d[d.length - 1].date.getTime() + 3600e3))} arasında tehlikeli saatler var (${type === 'river' ? 'sel/kabarma, rüzgar veya fırtına' : type === 'lake' ? 'sert rüzgar veya fırtına' : 'dalga, rüzgar veya fırtına'}). ${type === 'river' ? 'Kaygan ve oyulmuş dere kenarlarından, köprü altlarından uzak durun.' : type === 'lake' ? 'Açık iskele ve set üstünden uzak durun.' : 'Kayalık ve mendirek ucundan uzak durun.'}`);
  }
  if (sel && sel !== peak && val(sel) < win.score - 1.5) {
    out.push(`ℹ️ Seçtiğiniz ${hm(sel.date)} saati (${val(sel).toFixed(1)}) en iyi saate göre zayıf; mümkünse ${hm(win.from)} civarına kaydırın.`);
  }
  return out;
}

// Ay doğuşu / batışı (10 dk adımla tarama)
export function moonTimes(day, lat, lng) {
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  let prev = moonPosition(start, lat, lng).alt, rise = null, set = null;
  for (let m = 10; m <= 1440; m += 10) {
    const t = new Date(start.getTime() + m * 60000);
    const alt = moonPosition(t, lat, lng).alt;
    if (prev < 0 && alt >= 0 && !rise) rise = t;
    if (prev >= 0 && alt < 0 && !set) set = t;
    prev = alt;
  }
  return { rise, set };
}
