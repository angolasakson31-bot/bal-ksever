// Rehber: düğümler ve takımlar (çizimler SVG, renkler temaya uyar).
// Ölçüler başlangıç noktasıdır; balığın büyüklüğüne, akıntıya ve kamışınızın atar değerine göre ayarlayın.

// ——— Çizim yardımcıları ———
const W = 300, H = 120;
const svg = (body, h = H) => `<svg class="gsvg" viewBox="0 0 ${W} ${h}" role="img" aria-hidden="true">${body}</svg>`;
const hook = (x, y) => `<circle cx="${x}" cy="${y}" r="7" class="g-hook" fill="none"/>
  <path d="M${x + 7} ${y} H${x + 68} C${x + 96} ${y} ${x + 96} ${y + 40} ${x + 68} ${y + 40} H${x + 54} L${x + 60} ${y + 30}" class="g-hook" fill="none"/>`;
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="g-arrow" marker-end="url(#ah)"/>`;
const defs = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="g-ahead"/></marker></defs>`;
const coil = (x, y, n, dx = 9, ry = 9, cls = 'g-tag') => [...Array(n)].map((_, i) => `<ellipse cx="${x + i * dx}" cy="${y}" rx="${dx * 0.55}" ry="${ry}" class="${cls}" fill="none"/>`).join('');
const txt = (x, y, t, cls = 'g-txt') => `<text x="${x}" y="${y}" class="${cls}">${t}</text>`;
const knotBlob = (x, y) => `<rect x="${x - 10}" y="${y - 7}" width="20" height="14" rx="5" class="g-knot"/>`;
const scissors = (x, y) => `<text x="${x}" y="${y}" class="g-emoji">✂️</text>`;

// ——— Düğümler ———
export const KNOTS = [
  {
    id: 'palomar', name: 'Palomar düğümü', tag: 'En sağlam ve en kolay',
    use: 'İğne, fırdöndü, klips, maket balık. Monofilament, florokarbon ve örgü (PE) ipte çok sağlam.',
    steps: [
      ['Misinanın ucunu 15–20 cm ikiye katlayın. Oluşan halkayı iğne gözünden geçirin.',
        svg(defs + hook(170, 45) + `<path d="M8 41 H170" class="g-line"/><path d="M8 49 H170" class="g-line"/><path d="M170 41 C200 30 214 8 196 6 C178 4 168 30 170 49" class="g-line" fill="none"/>` + txt(10, 112, 'katlı misina') + arrow(120, 30, 160, 42))],
      ['Katlı misinayla gevşek, basit bir düğüm atın. İğne halkanın ucunda sarkar.',
        svg(hook(185, 70) + `<path d="M8 60 H95 C120 60 120 30 105 30 C90 30 92 70 125 70 H185" class="g-line" fill="none"/><path d="M8 66 H95" class="g-line"/><path d="M125 76 C160 100 230 110 240 80" class="g-line" fill="none"/>` + txt(70, 20, 'gevşek basit düğüm'))],
      ['Halkayı iğnenin tamamının üzerinden geçirin.',
        svg(defs + hook(150, 45) + `<path d="M8 45 H143" class="g-line"/><ellipse cx="200" cy="65" rx="62" ry="38" class="g-line" fill="none"/>` + arrow(262, 30, 250, 55) + txt(150, 115, 'halka iğnenin üstünden'))],
      ['Misinayı ıslatın. Ana misinayı ve ucu birlikte çekip sıkın. Ucu 3–4 mm bırakıp kesin.',
        svg(hook(150, 55) + `<path d="M8 55 H140" class="g-line"/><path d="M134 55 L120 72" class="g-tag"/>` + knotBlob(136, 55) + scissors(108, 92) + txt(20, 30, 'ıslat → çek → kes'))],
    ],
  },
  {
    id: 'clinch', name: 'Geliştirilmiş kilit düğümü (Improved Clinch)', tag: 'En yaygın',
    use: 'Monofilament ve florokarbonla iğne, fırdöndü, maket. Örgü (PE) ipte kayabilir; orada Palomar kullanın.',
    steps: [
      ['Ucu iğne gözünden 10–15 cm geçirin.',
        svg(defs + hook(150, 55) + `<path d="M8 55 H150" class="g-line"/><path d="M150 55 C135 75 110 80 70 80" class="g-tag" fill="none"/>` + arrow(60, 95, 100, 82) + txt(20, 112, 'uç (kısa kısım)'))],
      ['Ucu ana misinanın etrafına 5–7 tur sarın.',
        svg(hook(190, 55) + `<path d="M8 55 H190" class="g-line"/>` + coil(80, 55, 6, 13, 10) + `<path d="M150 55 C170 50 182 52 190 55" class="g-tag" fill="none"/>` + txt(80, 100, '5–7 tur'))],
      ['Ucu göze en yakın küçük halkadan, sonra yeni oluşan büyük halkadan geçirin.',
        svg(defs + hook(190, 55) + `<path d="M8 55 H190" class="g-line"/>` + coil(80, 55, 6, 13, 10) + `<path d="M150 62 C175 70 180 62 182 56" class="g-tag" fill="none"/><path d="M70 55 C60 85 130 95 165 70" class="g-tag" fill="none"/>` + arrow(160, 95, 172, 66) + txt(10, 112, '1: küçük halka  2: büyük halka'))],
      ['Islatıp ana misinayı çekerek sıkın. Sarımlar göze otursun. Fazlayı kesin.',
        svg(hook(170, 55) + `<path d="M8 55 H160" class="g-line"/>` + coil(130, 55, 4, 7, 6) + knotBlob(158, 55) + scissors(110, 95))],
    ],
  },
  {
    id: 'uni', name: 'Uni düğümü', tag: 'Her işe yarar',
    use: 'İğne, fırdöndü, makaraya misina bağlama. Örgü ipte 7–8 tur yapın.',
    steps: [
      ['Ucu gözden geçirip 15 cm geri katlayın; iki misina yan yana dursun.',
        svg(hook(200, 50) + `<path d="M8 50 H200" class="g-line"/><path d="M200 50 C190 62 175 62 60 62" class="g-tag" fill="none"/>` + txt(40, 100, 'uç, ana misinanın yanında'))],
      ['Ucu geri çevirip iki misinanın üstünde bir halka yapın.',
        svg(hook(200, 50) + `<path d="M8 50 H200" class="g-line"/><path d="M200 50 C190 62 175 62 60 62 C30 62 30 25 70 25 C100 25 120 45 130 58" class="g-tag" fill="none"/>` + txt(40, 105, 'halka'))],
      ['Ucu halkanın içinden, iki misinayı birlikte saracak şekilde 5–6 tur sarın.',
        svg(hook(210, 50) + `<path d="M8 50 H210" class="g-line"/><path d="M210 50 C200 62 190 58 50 58" class="g-tag" fill="none"/>` + coil(70, 54, 6, 14, 13) + txt(70, 105, '5–6 tur, iki misinanın etrafından'))],
      ['Ucu çekip düğümü toplayın. Sonra ana misinayı çekerek düğümü göze kaydırın. Fazlayı kesin.',
        svg(defs + hook(200, 55) + `<path d="M8 55 H185" class="g-line"/>` + knotBlob(150, 55) + arrow(150, 75, 186, 75) + scissors(120, 105) + txt(20, 30, 'düğümü göze kaydır'))],
    ],
  },
  {
    id: 'snell', name: 'Kürek iğne bağlama (Snell)', tag: 'Kürek başlı iğne, hair rig',
    use: 'Gözsüz kürek (yassı) başlı iğneler ve sazan "hair rig" iğneleri. Misina iğneyle düz bir çizgide durur, tutma oranı yükselir.',
    steps: [
      ['Misinayı iğnenin sapı boyunca yatırın (gözlü iğnede önce gözden geçirin). Sapın yanında bir halka bırakın.',
        svg(hook(60, 40) + `<path d="M8 32 H200" class="g-line"/><path d="M200 32 C230 32 230 70 180 70 H70" class="g-tag" fill="none"/>` + txt(140, 105, 'halka'))],
      ['Halkanın bir kolunu tutun; sapı ve misinayı birlikte, gözden aşağı doğru 7–10 tur sarın.',
        svg(hook(60, 50) + `<path d="M8 50 H60" class="g-line"/>` + coil(78, 50, 8, 7, 11) + `<path d="M135 50 C170 50 170 85 140 85 H100" class="g-tag" fill="none"/>` + txt(60, 112, '7–10 tur sap üzerine'))],
      ['Sarımları parmakla tutun ve ana misinayı çekin; halka sarımların altında kapanır.',
        svg(defs + hook(60, 50) + `<path d="M8 50 H60" class="g-line"/>` + coil(78, 50, 8, 7, 11) + arrow(40, 80, 8, 80) + txt(60, 112, 'ana misinayı çek'))],
      ['Sıkıca çekip ucu kesin. Misina iğnenin iç tarafından (uç tarafından) çıkmalı.',
        svg(hook(60, 50) + `<path d="M8 50 H60" class="g-line"/>` + coil(78, 50, 8, 7, 9, 'g-line') + scissors(150, 100) + txt(150, 30, 'hazır'))],
    ],
  },
  {
    id: 'dbluni', name: 'Çift Uni (iki misinayı birleştirme)', tag: 'Ana ip + lider',
    use: 'Örgü (PE) ana ipe florokarbon lider eklemek ya da iki misinayı birleştirmek için.',
    steps: [
      ['İki misinanın uçlarını 15–20 cm üst üste getirin.',
        svg(`<path d="M8 50 H200" class="g-line"/><path d="M80 60 H272" class="g-tag"/>` + txt(10, 95, 'ana ip') + txt(200, 95, 'lider'))],
      ['Birinci ucu diğer misinanın etrafına Uni gibi 4–6 tur sarıp halkadan geçirin.',
        svg(`<path d="M8 50 H200" class="g-line"/><path d="M80 60 H272" class="g-tag"/>` + coil(110, 55, 5, 12, 12, 'g-line') + txt(110, 100, 'uni (4–6 tur)'))],
      ['İkinci uçla aynısını ters yönde yapın. Örgü (PE) ipte 8–10 tur yapın.',
        svg(`<path d="M8 50 H200" class="g-line"/><path d="M80 60 H272" class="g-tag"/>` + coil(60, 55, 4, 10, 10, 'g-line') + coil(175, 55, 4, 10, 10) + txt(50, 100, 'uni 1') + txt(175, 100, 'uni 2'))],
      ['İki ana misinayı zıt yönlere çekin; düğümler birbirine kavuşsun. Uçları kesin.',
        svg(defs + `<path d="M8 55 H130" class="g-line"/><path d="M150 55 H272" class="g-tag"/>` + knotBlob(130, 55) + knotBlob(150, 55) + arrow(80, 85, 20, 85) + arrow(200, 85, 260, 85))],
    ],
  },
  {
    id: 'dropper', name: 'Kol düğümü (Dropper Loop)', tag: 'Çapari, kollu dip takımı',
    use: 'Ana misinanın ortasında dik duran bir halka (kol) yapar; buraya köstek ve iğne bağlanır.',
    steps: [
      ['Misinada 10–15 cm uzunluğunda bir halka yapın.',
        svg(`<path d="M8 70 H110 C110 20 170 20 170 70 H272" class="g-line" fill="none"/>` + txt(118, 110, 'halka'))],
      ['Halkanın iki yanını birbirinin etrafında 5–7 kez döndürün.',
        svg(`<path d="M8 70 H90" class="g-line"/><path d="M190 70 H272" class="g-line"/>` + coil(95, 70, 8, 12, 8, 'g-line') + `<path d="M140 62 C140 20 160 20 160 62" class="g-tag" fill="none"/>` + txt(95, 110, '5–7 dönme'))],
      ['Halkanın ortasını, dönmelerin tam ortasındaki aralıktan geçirin.',
        svg(defs + `<path d="M8 70 H90" class="g-line"/><path d="M190 70 H272" class="g-line"/>` + coil(95, 70, 8, 12, 8, 'g-line') + `<path d="M145 70 C145 105 165 105 165 80" class="g-tag" fill="none"/>` + arrow(150, 20, 150, 60))],
      ['Halkayı dişlerinizle ya da parmakla tutup iki ucu çekin; ortadan dik çıkan bir kol oluşur.',
        svg(`<path d="M8 70 H272" class="g-line"/>` + knotBlob(140, 70) + `<path d="M140 63 C125 20 155 20 140 63" class="g-tag" fill="none"/>` + txt(160, 30, 'kol (köstek buraya)'))],
    ],
  },
];

// ——— Takım şemaları (dikey) ———
const RIGS_Y0 = 16;
function rigSvg(parts) {
  let y = RIGS_Y0, body = '';
  const x = 60;
  const seg = (h, cls = 'g-line') => { body += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" class="${cls}"/>`; y += h; };
  // Uzun etiketleri iki satıra böl (sağdan taşmasın)
  const wrap = t => { const out = []; let cur = ''; for (const w of String(t).split(' ')) { if ((cur + ' ' + w).trim().length > 30 && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };
  let terminal = false; // takımın son parçası (iğne, maket…): altına çizgi uzatma
  const label = t => {
    const ls = wrap(t);
    body += `<text x="${x + 34}" y="${y + 4}" class="g-txt">${ls.map((l, i) => `<tspan x="${x + 34}" dy="${i ? 13 : 0}">${l}</tspan>`).join('')}</text><line x1="${x + 12}" y1="${y}" x2="${x + 30}" y2="${y}" class="g-lead"/>`;
    const extra = (ls.length - 1) * 13;
    if (extra && !terminal) body += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + extra}" class="g-line"/>`;
    y += extra;
  };
  for (const p of parts) {
    terminal = ['hook', 'lure', 'jig', 'egi', 'hairbait'].includes(p.t);
    if (p.t === 'line') {
      const ls = p.label ? wrap(p.label) : [];
      const h = Math.max(p.h || 26, ls.length * 13 + 8);
      seg(h, p.cls);
      if (ls.length) body += `<text x="${x + 34}" y="${y - h / 2 + 4 - (ls.length - 1) * 6}" class="g-txt2">${ls.map((l, i) => `<tspan x="${x + 34}" dy="${i ? 13 : 0}">${l}</tspan>`).join('')}</text>`;
      continue;
    }
    if (p.t === 'water') { body = `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="g-water"/><text x="${W - 4}" y="${y - 4}" class="g-txt2" text-anchor="end">su yüzeyi</text>` + body; continue; }
    if (p.t === 'swivel') { body += `<circle cx="${x}" cy="${y + 4}" r="4" class="g-metal" fill="none"/><circle cx="${x}" cy="${y + 13}" r="4" class="g-metal" fill="none"/>`; y += 8; label(p.label); y += 9; continue; }
    if (p.t === 'bead' || p.t === 'stop') { seg(6); body += `<circle cx="${x}" cy="${y + 5}" r="${p.t === 'stop' ? 3.5 : 5}" class="${p.t === 'stop' ? 'g-stop' : 'g-bead'}"/>`; y += 5; label(p.label); y += 7; seg(6); continue; }
    if (p.t === 'float') { body += `<path d="M${x} ${y} C${x + 9} ${y + 12} ${x + 9} ${y + 34} ${x} ${y + 44} C${x - 9} ${y + 34} ${x - 9} ${y + 12} ${x} ${y}" class="g-float"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y + 16}" class="g-floattop"/>`; y += 22; label(p.label); y += 22; continue; }
    if (p.t === 'lead' || p.t === 'feeder') {
      const h = p.t === 'feeder' ? 30 : 22;
      body += p.t === 'feeder'
        ? `<rect x="${x - 11}" y="${y}" width="22" height="${h}" rx="6" class="g-feeder"/>`
        : `<path d="M${x} ${y} C${x + 10} ${y + 8} ${x + 10} ${y + h} ${x} ${y + h} C${x - 10} ${y + h} ${x - 10} ${y + 8} ${x} ${y}" class="g-leadw"/>`;
      y += h / 2; label(p.label); y += h / 2; continue;
    }
    if (p.t === 'shot') { for (let i = 0; i < 3; i++) body += `<circle cx="${x}" cy="${y + 4 + i * 9}" r="3.5" class="g-leadw"/>`; y += 13; label(p.label); y += 14; continue; }
    if (p.t === 'hook') { body += `<path d="M${x} ${y} V${y + 16} C${x} ${y + 28} ${x + 14} ${y + 28} ${x + 14} ${y + 16} L${x + 9} ${y + 20}" class="g-hook" fill="none"/>`; y += 14; label(p.label); y += 16; continue; }
    if (p.t === 'lure') { body += `<path d="M${x - 6} ${y} Q${x + 14} ${y + 14} ${x - 6} ${y + 34} Q${x - 16} ${y + 16} ${x - 6} ${y}" class="g-lure"/><path d="M${x - 2} ${y + 34} v8" class="g-hook"/>`; y += 20; label(p.label); y += 24; continue; }
    if (p.t === 'jig') { body += `<circle cx="${x}" cy="${y + 7}" r="7" class="g-leadw"/><path d="M${x} ${y + 12} C${x + 6} ${y + 26} ${x - 6} ${y + 34} ${x + 2} ${y + 44}" class="g-soft" fill="none"/>`; y += 20; label(p.label); y += 26; continue; }
    if (p.t === 'egi') { body += `<path d="M${x} ${y} L${x + 7} ${y + 30} L${x} ${y + 36} L${x - 7} ${y + 30} Z" class="g-lure"/><path d="M${x - 6} ${y + 38} h12" class="g-hook"/>`; y += 20; label(p.label); y += 22; continue; }
    if (p.t === 'branches') {
      for (let i = 0; i < p.n; i++) {
        seg(18);
        body += `<path d="M${x} ${y} L${x - 26} ${y + 6}" class="g-tag"/><path d="M${x - 26} ${y + 6} v8 c0 7 8 7 8 0" class="g-hook" fill="none"/>`;
      }
      label(p.label); seg(10); continue;
    }
    if (p.t === 'hairbait') { body += `<line x1="${x + 7}" y1="${y - 6}" x2="${x + 7}" y2="${y + 6}" class="g-tag"/><circle cx="${x + 7}" cy="${y + 11}" r="6" class="g-bait"/>`; y += 10; label(p.label); y += 10; continue; }
    if (p.t === 'sidehook') {
      seg(8);
      body += `<path d="M${x} ${y} L${x - 30} ${y + 14}" class="g-tag"/><path d="M${x - 30} ${y + 14} v10 c0 8 9 8 9 0" class="g-hook" fill="none"/>`;
      seg(6); label(p.label); seg(30);
      continue;
    }
  }
  return `<svg class="gsvg rig" viewBox="0 0 ${W} ${y + 14}" role="img" aria-hidden="true">${body}</svg>`;
}

// ——— Takımlar ———
export const RIGS = {
  sea: [
    { name: 'Çapari takımı', fish: 'İstavrit, kolyoz, uskumru, sardalya',
      parts: [{ t: 'line', label: 'ana misina 0.25–0.30 mm' }, { t: 'swivel', label: 'fırdöndü' }, { t: 'branches', n: 4, label: 'hazır çapari, 5–8 iğne (no. 8–12)' }, { t: 'lead', label: 'kurşun 20–60 g (akıntıya göre)' }],
      specs: ['Kamış: 2,4–3,6 m, 20–60 g atar', 'Makine: 2500–4000', 'Ana misina: 0,25–0,30 mm', 'Çapari: 5–8 iğneli, iğne no. 8–12', 'Kurşun: 20–60 g, en alta'],
      how: ['Kurşunu dibe indirin, sonra 1–2 tur sarıp yukarı alın.', 'Kamışı yavaşça kaldırıp indirin; çapari tüyleri küçük balık gibi oynar.', 'Vuruş gelince hemen almayın; birkaç balık daha takılsın.', 'En iyi zaman: akşamüstü ve ışıklı iskele altı.'] },
    { name: 'LRF (hafif kaya balıkçılığı)', fish: 'İstavrit, iskorpit, karagöz, küçük levrek, kalamar yavrusu',
      parts: [{ t: 'line', label: 'PE 0.3–0.6 ana ip' }, { t: 'line', h: 30, cls: 'g-tag', label: 'florokarbon 0.16–0.20 mm, 1 m (Çift Uni)' }, { t: 'jig', label: 'jig head 1–5 g + 2–3" silikon' }],
      specs: ['Kamış: 1,8–2,3 m, 1–7 g atar', 'Makine: 1000–2000', 'Ana ip: PE 0,3–0,6', 'Lider: florokarbon 0,16–0,20 mm, ~1 m', 'Jig head: 1–5 g (sakin suda hafif)'],
      how: ['Atın, jig dibe değene kadar bekleyin (ip gevşer).', 'Kısa, hafif zıplatmalarla dipten getirin.', 'Taş aralarını, iskele ayaklarını tarayın.', 'Gece ışıklı iskelede çok verimli.'] },
    { name: 'Spin (maket balık / kaşık)', fish: 'Levrek, lüfer, palamut, zargana',
      parts: [{ t: 'line', label: 'PE 0.8–1.2 ana ip' }, { t: 'line', h: 30, cls: 'g-tag', label: 'florokarbon 0.30–0.40 mm, 1–1,5 m' }, { t: 'swivel', label: 'klips (maketi kolay değiştirmek için)' }, { t: 'lure', label: 'rapala 9–14 cm veya kaşık 20–40 g' }],
      specs: ['Kamış: 2,7–3,0 m, 10–40 g atar', 'Makine: 3000–4000', 'Ana ip: PE 0,8–1,2', 'Lider: florokarbon 0,30–0,40 mm', 'Lüfer dişlidir: kalın lider ya da 10–15 cm çelik tel'],
      how: ['Uzağa atın, farklı hızlarda sarın.', 'Levrek: alacakaranlıkta, köpüklü ve dalgalı kıyıda.', 'Lüfer/palamut: sürü geçerken hızlı sarım.', 'Ara ara durup maketi "yaralı balık" gibi oynatın.'] },
    { name: 'Kollu dip takımı', fish: 'Çipura, karagöz, sargoz, mezgit, barbunya',
      parts: [{ t: 'line', label: 'ana misina 0.30–0.35 mm' }, { t: 'swivel', label: 'fırdöndü' }, { t: 'sidehook', label: 'kol 0.25 mm, 20–30 cm + iğne no. 4–8' }, { t: 'sidehook', label: 'ikinci kol (Kol düğümü ile)' }, { t: 'line', h: 16, label: '' }, { t: 'lead', label: 'armut kurşun 40–100 g' }],
      specs: ['Kamış: 3,0–4,2 m, 50–150 g atar', 'Ana misina: 0,30–0,35 mm', 'Kollar: 0,25–0,28 mm, 20–30 cm, kol düğümüyle', 'İğne: no. 4–8 (çipura için kalın telli)', 'Kurşun: 40–100 g armut'],
      how: ['Atıp kurşun dibe oturunca misinayı hafif gerin.', 'Kamışı sabitleyin, uca bakın; çipura önce "tıklar".', 'Vuruşta hemen değil, kamış eğilince tasmalayın.', 'Yem: karides, midye, boru kurdu, yengeç.'] },
    { name: 'Şamandıralı takım', fish: 'Levrek, çipura, kefal, karagöz, zargana',
      parts: [{ t: 'water' }, { t: 'line', label: 'ana misina 0.25–0.28 mm' }, { t: 'stop', label: 'stoper (derinlik ayarı)' }, { t: 'bead', label: 'boncuk' }, { t: 'float', label: 'kayar şamandıra 3–10 g' }, { t: 'line', h: 20, label: '' }, { t: 'shot', label: 'saçma kurşunlar' }, { t: 'swivel', label: 'küçük fırdöndü' }, { t: 'line', h: 34, cls: 'g-tag', label: 'köstek 0.20–0.25 mm, 50–80 cm' }, { t: 'hook', label: 'iğne no. 6–10 (kefal 10–14)' }],
      specs: ['Kamış: 3,6–4,5 m', 'Ana misina: 0,25–0,28 mm', 'Kayar şamandıra: 3–10 g', 'Köstek: 0,20–0,25 mm, 50–80 cm', 'İğne: no. 6–10, kefal için 10–14'],
      how: ['Stoperi kaydırarak yemin derinliğini ayarlayın.', 'Kurşunları, şamandıranın sadece ucu suyun üstünde kalacak kadar ekleyin.', 'Şamandıra batınca ya da yana kayınca tasmalayın.', 'Kefal için ekmek ile yemleme yapın.'] },
    { name: 'Surf takımı (kumsal)', fish: 'Mırmır, çipura, barbunya, levrek',
      parts: [{ t: 'line', label: 'ana misina 0.30–0.35 mm' }, { t: 'line', h: 30, cls: 'g-tag', label: 'şok lideri 0.50–0.60 mm (Çift Uni)' }, { t: 'sidehook', label: 'köstek 0.25–0.30 mm, 60–100 cm' }, { t: 'line', h: 16, label: '' }, { t: 'lead', label: 'kurşun 80–150 g' }],
      specs: ['Kamış: 4,2–4,5 m surf, 100–200 g', 'Makine: 5000–8000 uzun bobin', 'Ana misina: 0,30–0,35 mm', 'Şok lideri: 0,50–0,60 mm, kamış boyunun 2 katı', 'İğne: uzun saplı no. 2–6, yem: kum kurdu'],
      how: ['Atış sırasında kopmasın diye şok lideri şarttır.', 'Dalganın kırıldığı çizginin arkasına atın.', 'Gece mırmır kıyıya çok yaklaşır, uzak atış gerekmez.', 'Kamışı sehpaya koyup ucu izleyin.'] },
    { name: 'Kalamar takımı (egi)', fish: 'Kalamar, mürekkep balığı',
      parts: [{ t: 'line', label: 'PE 0.6–0.8 ana ip' }, { t: 'line', h: 30, cls: 'g-tag', label: 'florokarbon 0.25–0.30 mm, 1–2 m' }, { t: 'swivel', label: 'küçük klips' }, { t: 'egi', label: 'egi (kalamar zokası) 2.5–3.5' }],
      specs: ['Kamış: 2,4–2,7 m egi kamışı', 'Makine: 2500–3000', 'Ana ip: PE 0,6–0,8', 'Lider: florokarbon 0,25–0,30 mm', 'Egi: 2,5–3,5 boy'],
      how: ['Atın, egiyi dibe kadar batırın.', '2–3 sert çekiş yapıp egiyi zıplatın.', 'Sonra ipi gergin tutarak süzülerek batmasını bekleyin; kalamar çoğunlukla bu sırada saldırır.', 'En iyi: gece, ışıklı iskele kenarı.'] },
  ],
  lake: [
    { name: 'Sazan: method feeder + hair rig', fish: 'Sazan, aynalı sazan',
      parts: [{ t: 'line', label: 'ana misina 0.28–0.30 mm' }, { t: 'feeder', label: 'method feeder 30–50 g (yemle doldurulur)' }, { t: 'swivel', label: 'fırdöndü (feeder içine oturur)' }, { t: 'line', h: 26, cls: 'g-tag', label: 'köstek 0.20–0.25 mm, ~10 cm' }, { t: 'hook', label: 'iğne no. 8–12 (Kürek iğne bağlama)' }, { t: 'hairbait', label: 'saç (hair) üstünde mısır / pellet / boilie' }],
      specs: ['Kamış: 3,6 m feeder / sazan kamışı', 'Makine: 4000–6000, serbest makara (baitrunner) varsa iyi', 'Ana misina: 0,28–0,30 mm', 'Köstek: 0,20–0,25 mm, ~10 cm', 'İğne: no. 8–12; yem iğneye değil "saça" takılır'],
      how: ['Feederi ıslak yemle sıkıştırın, saçtaki yemi yemin içine gömün.', 'Hep aynı noktaya atın; yem orada birikir.', 'Kamışı sehpaya koyun, makine frenini gevşek tutun.', 'Sazan yemi alıp kaçınca iğne kendiliğinden takılır.'] },
    { name: 'Hafif şamandıra takımı', fish: 'Kızılkanat, tatlısu kefali, küçük sazan',
      parts: [{ t: 'water' }, { t: 'line', label: 'ana misina 0.18–0.20 mm' }, { t: 'float', label: 'kalem şamandıra 1–3 g' }, { t: 'line', h: 26, label: '' }, { t: 'shot', label: 'saçma kurşun dizisi' }, { t: 'line', h: 30, cls: 'g-tag', label: 'köstek 0.14–0.16 mm, ~30 cm' }, { t: 'hook', label: 'iğne no. 14–18' }],
      specs: ['Kamış: 3–5 m hafif kamış', 'Ana misina: 0,18–0,20 mm', 'Şamandıra: 1–3 g kalem tipi', 'Köstek: 0,14–0,16 mm', 'İğne: no. 14–18; yem: ekmek içi, kurtçuk, mısır'],
      how: ['Saçmalarla şamandırayı sadece ucu görünene kadar dengeleyin.', 'Az ama sık yemleme yapın (ekmek kırıntısı, yem karışımı).', 'Şamandıra hafifçe batar ya da yatar: hemen tasmalayın.', 'Kıyıya yakın, sazlık kenarları verimli.'] },
    { name: 'Turna: spin + çelik tel', fish: 'Turna',
      parts: [{ t: 'line', label: 'PE 1.0–1.5 veya 0.30–0.35 mm misina' }, { t: 'swivel', label: 'fırdöndü' }, { t: 'line', h: 30, cls: 'g-wire', label: 'çelik tel 30–40 cm (şart!)' }, { t: 'swivel', label: 'klips' }, { t: 'lure', label: 'kaşık 10–25 g / rapala 9–15 cm' }],
      specs: ['Kamış: 2,4–2,7 m, 15–50 g atar', 'Makine: 3000–4000', 'Ana ip: PE 1,0–1,5', 'Çelik tel: 30–40 cm, en az 9 kg dayanım', 'Yasak: 15 Aralık – 31 Mart (iliniz için kontrol edin)'],
      how: ['Turnanın dişleri misinayı keser; çelik tel olmadan bağlamayın.', 'Sazlık ve su bitkisi kenarlarına atın.', 'Orta hızda sarın, ara ara duraklatın.', 'Kapalı, rüzgarlı havada daha aktif.'] },
    { name: 'Sudak / tatlısu levreği: jig', fish: 'Sudak, tatlısu levreği (perch)',
      parts: [{ t: 'line', label: 'PE 0.6–1.0 ana ip' }, { t: 'line', h: 30, cls: 'g-tag', label: 'florokarbon 0.25–0.30 mm, ~1 m' }, { t: 'jig', label: 'jig head 5–15 g + 7–10 cm silikon' }],
      specs: ['Kamış: 2,1–2,4 m, 5–25 g atar', 'Makine: 2500–3000', 'Ana ip: PE 0,6–1,0', 'Lider: florokarbon 0,25–0,30 mm', 'Jig head: 5–15 g; iğne silikon boyuna uygun (8–10 cm için 2/0)'],
      how: ['Atın, jig dibe değene kadar sayın (derinliği öğrenirsiniz).', 'Makineyi 2–3 hızlı tur sarıp durun; jig dibe düşerken vurur.', 'Hep dipte kalın; vuruş "tık" diye hissedilir.', 'Akşam ve gece daha verimli.'] },
    { name: 'Yayın: kalın dip takımı', fish: 'Yayın balığı',
      parts: [{ t: 'line', label: 'ana misina 0.50–0.60 mm veya PE 3–5' }, { t: 'lead', label: 'kayar kurşun 80–150 g' }, { t: 'bead', label: 'boncuk (düğümü korur)' }, { t: 'swivel', label: 'sağlam fırdöndü' }, { t: 'line', h: 34, cls: 'g-tag', label: 'köstek 0.60–0.80 mm, ~50 cm' }, { t: 'hook', label: 'iğne 2/0–6/0' }],
      specs: ['Kamış: 3 m güçlü, 100–300 g', 'Makine: 6000–8000, sağlam fren', 'Ana ip: 0,50–0,60 mm veya PE 3–5', 'Köstek: 0,60–0,80 mm', 'Yem: solucan demeti, canlı yem, tavuk ciğeri'],
      how: ['Kayar kurşun sayesinde balık ağırlığı hissetmeden yemi alır.', 'Derin çukurlar ve batık ağaç kenarları iyi yerlerdir.', 'Gece ve sıcak havada aktiftir.', 'Freni ayarlı tutun; ilk kaçışı çok güçlüdür.'] },
    { name: 'Alabalık: hafif spin (dere)', fish: 'Alabalık',
      parts: [{ t: 'line', label: 'misina 0.16–0.20 mm (veya PE 0.4)' }, { t: 'swivel', label: 'küçük klips' }, { t: 'lure', label: 'dönen kaşık 2–6 g / küçük rapala 5–7 cm' }],
      specs: ['Kamış: 1,8–2,1 m, 2–10 g atar', 'Makine: 1000–2000', 'Misina: 0,16–0,20 mm', 'Yem: dönen kaşık 2–6 g, küçük rapala', 'Doğal alabalıkta Ekim–Şubat av yasağına dikkat'],
      how: ['Akıntının yukarısına çapraz atın, akıntıyla birlikte getirin.', 'Taş arkaları ve sakin cepler balığın beklediği yerlerdir.', 'Gölgenizi suya düşürmeyin, sessiz yaklaşın.', 'Su serin ve hafif bulanıkken daha iyi.'] },
  ],
};

export function renderKnots() {
  return KNOTS.map(k => `<details class="card guide-card">
    <summary><span>🪢 <b>${k.name}</b></span><span class="tag">${k.tag}</span></summary>
    <p class="guide-use">${k.use}</p>
    <ol class="steps">${k.steps.map(([t, s], i) => `<li><div class="step-fig">${s}</div><div class="step-txt"><b>${i + 1}.</b> ${t}</div></li>`).join('')}</ol>
    <p class="muted">İpucu: Sıkmadan önce düğümü tükürük ya da suyla ıslatın; sürtünmeden ısınan misina zayıflar.</p>
  </details>`).join('');
}

export function renderRigs(kind) {
  return RIGS[kind].map(r => `<details class="card guide-card">
    <summary><span>🎣 <b>${r.name}</b></span></summary>
    <p class="guide-use">🐟 ${r.fish}</p>
    <div class="rig-wrap">${rigSvg(r.parts)}</div>
    <h4>Ölçüler</h4><ul class="specs">${r.specs.map(x => `<li>${x}</li>`).join('')}</ul>
    <h4>Nasıl kullanılır</h4><ol class="howto">${r.how.map(x => `<li>${x}</li>`).join('')}</ol>
  </details>`).join('');
}
