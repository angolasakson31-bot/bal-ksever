// Düğüm anlatımları: adım adım SVG çizimler.
// Çizim dili: MAVİ = ana misina (kamışa giden), TURUNCU = misinanın ucu (sizin sarıp geçirdiğiniz kısım).
// Kesişimlerde üstteki tel, alttakinin üstünden "boşluk" bırakarak geçer (hangisi üstte belli olsun diye).

const W = 320, H = 160;
const fig = body => `<svg class="gsvg knot" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true"><defs><marker id="kah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="g-ahead"/></marker></defs>${body}</svg>`;

// Tek tel (üstten geçen kısımda arkasındakini kesmiş gibi görünür)
const ln = (d, k = 's') => `<path d="${d}" class="halo"/><path d="${d}" class="${k === 's' ? 'g-line' : 'g-tag'}"/>`;
// Katlanmış (çift) misina: iki paralel tel gibi görünür; ucu yuvarlak = katlanma yeri
const dbl = d => `<path d="${d}" class="halo-w"/><path d="${d}" class="g-dbl-o"/><path d="${d}" class="g-dbl-i"/>`;
const arrow = d => `<path d="${d}" class="g-arrow" fill="none" marker-end="url(#kah)"/>`;
const t = (x, y, s, a = 'start') => `<text x="${x}" y="${y}" class="g-txt" text-anchor="${a}">${s}</text>`;
const blob = (x, y, w = 22) => `<rect x="${x - w / 2}" y="${y - 7}" width="${w}" height="14" rx="6" class="g-knot"/>`;
const cut = (x, y) => `<text x="${x}" y="${y}" class="g-emoji">✂️</text>`;

// Sarımlar: (x0'dan başlayarak) n tur, yC ekseni etrafında ±h yükseklikte.
// Öndeki yarım turlar halo ile çizilir (telin üstünden geçer), arkadakiler soluk çizilir.
function coil(x0, n, step, yC, h, k = 't') {
  let back = '', front = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    front += ln(`M${x} ${yC + h} L${x + step / 2} ${yC - h}`, k);
    back += `<path d="M${x + step / 2} ${yC - h} L${x + step} ${yC + h}" class="g-back ${k === 's' ? 'bs' : 'bt'}"/>`;
  }
  return { back, front, end: [x0 + n * step, yC + h] };
}

// ——— İğneler ———
// Yatay iğne: göz sağda (78,64), uç solda. Gözün arka yarısı çizgilerden önce, ön yarısı sonra çizilir.
const E = { x: 84, y: 64, r: 10 };
const ringBack = (e = E) => `<path d="M${e.x - e.r} ${e.y} A${e.r} ${e.r} 0 0 1 ${e.x + e.r} ${e.y}" class="g-ring"/>`;
const ringFront = (e = E) => `<path d="M${e.x + e.r} ${e.y} A${e.r} ${e.r} 0 0 1 ${e.x - e.r} ${e.y}" class="g-ring"/>`;
const hookH = (e = E) => `<path d="M${e.x - e.r} ${e.y} H34 C8 ${e.y} 8 ${e.y + 44} 34 ${e.y + 44} H52 L45 ${e.y + 30}" class="g-hook"/>`;
// Dikey iğne (Palomar için): göz üstte
const EV = { x: 110, y: 66, r: 10 };
const hookV = (e = EV) => `<path d="M${e.x} ${e.y + e.r} V${e.y + 58} C${e.x} ${e.y + 88} ${e.x + 40} ${e.y + 88} ${e.x + 40} ${e.y + 58} V${e.y + 44} L${e.x + 31} ${e.y + 56}" class="g-hook"/>`;
// Kürek (yassı başlı) iğne, uzun sap
const hookSpade = `<path d="M236 70 H64 C34 70 34 118 64 118 H82 L75 104" class="g-hook"/><rect x="234" y="62" width="10" height="16" rx="2" class="g-spade"/>`;
// Maket halkası (Rapala halkası için)
const lureRing = `<path d="M8 50 Q34 36 44 64 Q34 92 8 78 Z" class="g-lurebody"/><circle cx="56" cy="64" r="8" class="g-ring" fill="none"/>`;

// Gözden geçmiş başlangıç: ana tel sağdan göze girer, uç gözün etrafından dönüp üstte sağa gider
const throughEye = (tagTo, tagY = 36) => ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C${E.x - 24} 68 ${E.x - 26} ${tagY} ${E.x + 4} ${tagY} H${tagTo}`, 't');

export const KNOTS = [
  // ——— İğneye bağlama ———
  {
    id: 'palomar', group: 'İğne / fırdöndü bağlama', name: 'Palomar düğümü', tag: 'En sağlam ve en kolay',
    use: 'İğne, fırdöndü, klips, maket balık. Misina, florokarbon ve örgü (PE) ipte çok sağlam. Büyük maketlerde halkanın maketin üzerinden geçmesi gerektiğini unutmayın.',
    video: 'palomar düğümü nasıl bağlanır',
    steps: [
      ['Misinanın ucunu 15–20 cm ikiye katlayın. Katlanan yeri (halkayı) iğnenin gözünden geçirin.',
        fig(ringBack(EV) + dbl(`M318 40 H170 C140 40 116 48 110 66 C106 84 88 96 70 100`) + ringFront(EV) + hookV() + t(200, 28, 'ikiye katlanmış misina') + t(18, 128, 'halka gözden geçti'))],
      ['Katlı misinayla gevşek, basit bir düğüm atın. İğne, düğümün altındaki halkada sarkar; düğümü sıkmayın.',
        fig(ringBack(EV) + dbl(`M318 34 H252 C222 34 208 62 226 78 C244 94 266 64 242 52 C220 40 196 54 176 66 C156 78 128 74 112 68`) + ringFront(EV) + dbl(`M112 70 C104 92 136 112 172 112`) + hookV() + t(200, 22, 'gevşek basit düğüm') + t(180, 128, 'halka'))],
      ['Halkayı iğnenin tamamının üzerinden geçirin (halka iğnenin altından dolaşıp yukarı gelir).',
        fig(ringBack(EV) + dbl(`M318 34 H252 C222 34 208 62 226 78 C244 94 266 64 242 52 C220 40 196 54 176 66 C156 78 128 74 112 68`) + ringFront(EV) + hookV() + dbl(`M112 70 C150 90 190 150 120 156 C60 160 54 120 70 96`) + arrow('M200 120 C196 140 180 150 160 152') + t(212, 132, 'halka iğnenin altından'))],
      ['Misinayı ıslatın. Ana misinayı ve ucu birlikte yavaşça çekip sıkın; düğüm gözün üstüne otursun. Ucu 3–4 mm bırakıp kesin.',
        fig(ringBack(EV) + ln(`M318 40 H170 C140 40 120 48 112 56`, 's') + ringFront(EV) + hookV() + blob(112, 54) + ln('M120 50 L150 30', 't') + cut(150, 30) + t(170, 70, 'ıslat → sık → kes'))],
    ],
  },
  {
    id: 'clinch', group: 'İğne / fırdöndü bağlama', name: 'Geliştirilmiş kilit düğümü (Improved Clinch)', tag: 'En yaygın',
    use: 'Misina ve florokarbonla iğne, fırdöndü, maket. Örgü (PE) ipte kayabilir; orada Palomar ya da Uni kullanın. 0,40 mm üstü kalın misinada 4–5 tur yeter.',
    video: 'improved clinch knot düğüm',
    steps: [
      ['Ucu iğnenin gözünden 10–15 cm geçirin. Uç, ana misinanın yanında dursun.',
        fig(ringBack() + throughEye(240) + ringFront() + hookH() + t(160, 24, 'uç (10–15 cm)') + t(200, 92, 'ana misina'))],
      ['Ucu ana misinanın etrafına 5–7 tur sarın (gözden uzaklaşarak).',
        (() => { const c = coil(118, 6, 14, 52, 22); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 C104 36 110 34 118 74`, 't') + ringFront() + hookH() + c.front + ln(`M${c.end[0]} ${c.end[1]} L${c.end[0] + 18} ${c.end[1] + 14}`, 't') + t(130, 112, '5–7 tur')); })()],
      ['Ucu geri getirip GÖZE EN YAKIN küçük halkadan geçirin (gözle ilk sarım arasındaki boşluk).',
        (() => { const c = coil(118, 6, 14, 52, 22); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 C104 36 110 34 118 74`, 't') + ringFront() + hookH() + c.front + ln(`M${c.end[0]} ${c.end[1]} C${c.end[0] + 40} 120 150 140 104 92 C100 82 100 62 104 52`, 't') + arrow('M130 128 C112 120 104 104 104 80') + t(150, 150, '① göz dibindeki küçük halka')); })()],
      ['Sonra ucu, az önce oluşan BÜYÜK halkadan geri geçirin. (Bu adım "geliştirilmiş" kısmıdır, düğümü kilitler.)',
        (() => { const c = coil(118, 6, 14, 52, 22); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 C104 36 110 34 118 74`, 't') + ringFront() + hookH() + c.front + ln(`M${c.end[0]} ${c.end[1]} C${c.end[0] + 40} 120 150 140 104 92 C100 82 100 62 104 52 C108 28 150 16 176 20`, 't') + arrow('M150 14 C166 10 180 14 186 22') + t(180, 150, '② büyük halka', 'middle')); })()],
      ['Islatın, ana misinayı çekerek sarımları göze doğru sıkın. Ucu 3 mm bırakıp kesin.',
        (() => { const c = coil(96, 6, 8, 66, 9); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ringFront() + hookH() + c.front + ln('M144 72 L160 92', 't') + cut(160, 104) + t(190, 40, 'ıslat → sık → kes')); })()],
    ],
  },
  {
    id: 'trilene', group: 'İğne / fırdöndü bağlama', name: 'Trilene düğümü', tag: 'Kilitten sağlam',
    use: 'Geliştirilmiş kilit düğümünün daha sağlamı: misina gözden iki kez geçer, gözde sürtünmeye dayanır. İğne, fırdöndü, klips.',
    video: 'trilene knot düğüm',
    steps: [
      ['Ucu gözden iki kez geçirin; gözde çift halka oluşsun.',
        fig(ringBack() + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C62 68 62 46 ${E.x} 46 C102 46 102 70 ${E.x} 74 C58 78 54 36 ${E.x + 4} 36 H240`, 't') + ringFront() + hookH() + t(150, 24, 'gözde iki tur') + t(200, 92, 'ana misina'))],
      ['Ucu ana misinanın etrafına 5 tur sarın.',
        (() => { const c = coil(122, 5, 15, 52, 22); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C62 68 62 46 ${E.x} 46 C102 46 102 70 ${E.x} 74 C58 78 54 36 ${E.x + 4} 36 C110 36 116 40 122 74`, 't') + ringFront() + hookH() + c.front + t(130, 112, '5 tur')); })()],
      ['Ucu gözün yanındaki çift halkanın içinden geçirin.',
        (() => { const c = coil(122, 5, 15, 52, 22); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C62 68 62 46 ${E.x} 46 C102 46 102 70 ${E.x} 74 C58 78 54 36 ${E.x + 4} 36 C110 36 116 40 122 74`, 't') + ringFront() + hookH() + c.front + ln(`M${c.end[0]} ${c.end[1]} C${c.end[0] + 30} 130 110 140 96 100 C92 88 90 74 92 60`, 't') + arrow('M120 132 C104 124 96 110 94 86') + t(140, 150, 'çift halkanın içinden')); })()],
      ['Islatıp ana misinayı çekerek sıkın; ucu kesin.',
        (() => { const c = coil(98, 5, 9, 66, 9); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ringFront() + hookH() + c.front + ln('M143 72 L158 92', 't') + cut(158, 104) + t(190, 40, 'ıslat → sık → kes')); })()],
    ],
  },
  {
    id: 'uni', group: 'İğne / fırdöndü bağlama', name: 'Uni düğümü', tag: 'Her işe yarar',
    use: 'İğne, fırdöndü, makaraya misina bağlama ve iki misina birleştirme (Çift Uni). Örgü (PE) ipte 7–8 tur yapın.',
    video: 'uni knot düğümü nasıl bağlanır',
    steps: [
      ['Ucu gözden geçirip 15–20 cm geri katlayın; iki tel yan yana dursun.',
        fig(ringBack() + throughEye(250) + ringFront() + hookH() + t(160, 24, 'uç') + t(200, 92, 'ana misina'))],
      ['Ucu geri kıvırıp iki telin ÜSTÜNDE bir halka yapın.',
        fig(ringBack() + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 H250 C282 36 282 6 250 6 H140 C114 6 112 96 140 96 H170`, 't') + ringFront() + hookH() + t(190, 130, 'halka (iki telin üstünde)'))],
      ['Ucu halkanın İÇİNDEN geçirerek iki teli birlikte 5–6 tur sarın.',
        (() => { const c = coil(140, 6, 16, 52, 28); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 H250 C282 36 282 6 250 6 H140 C126 6 132 60 140 80`, 't') + ringFront() + hookH() + c.front + ln(`M${c.end[0]} ${c.end[1]} L${c.end[0] + 18} ${c.end[1] + 14}`, 't') + t(150, 128, '5–6 tur, iki telin etrafından')); })()],
      ['Ucu çekip sarımları toplayın. Sonra ana misinayı çekerek düğümü göze kaydırın. Ucu kesin.',
        (() => { const c = coil(104, 5, 9, 66, 10); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ringFront() + hookH() + c.front + ln('M149 74 L164 94', 't') + cut(164, 106) + arrow('M260 40 C210 40 168 46 150 56') + t(196, 26, 'düğümü göze kaydır')); })()],
    ],
  },
  {
    id: 'sandiego', group: 'İğne / fırdöndü bağlama', name: 'San Diego Jam', tag: 'Florokarbon için çok sağlam',
    use: 'Florokarbon ve misinayla iğne, fırdöndü, maket. Kalın liderlerde bile düzgün sıkışır; levrek/lüfer spin takımında sevilir.',
    video: 'san diego jam knot',
    steps: [
      ['Ucu gözden geçirip 20 cm geri getirin; iki teli yan yana tutun.',
        fig(ringBack() + throughEye(290) + ringFront() + hookH() + t(190, 24, 'uç (20 cm)') + t(200, 92, 'ana misina'))],
      ['Ucu İKİ TELİ birlikte saracak şekilde, GÖZE DOĞRU 7 tur sarın.',
        (() => { const c = coil(126, 7, 16, 52, 28); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 H290 C306 36 306 80 ${c.end[0]} 80`, 't') + ringFront() + hookH() + c.front + arrow('M240 120 H140') + t(150, 140, '7 tur, göze doğru')); })()],
      ['Ucu, göz ile ilk sarım arasındaki küçük halkadan geçirin.',
        (() => { const c = coil(126, 7, 16, 52, 28); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ln(`M${E.x} 68 C60 68 58 36 ${E.x + 4} 36 H290 C306 36 306 80 ${c.end[0]} 80`, 't') + ringFront() + hookH() + c.front + ln('M126 80 C116 108 98 100 106 56', 't') + arrow('M90 126 C100 116 106 100 106 80') + t(40, 148, 'göz dibindeki halkadan')); })()],
      ['Sonra ucu, tel ile sarımlar arasında oluşan yan halkadan geçirin. Islatıp ana misinayı çekerek sıkın, ucu kesin.',
        (() => { const c = coil(98, 7, 8, 66, 10); return fig(ringBack() + c.back + ln(`M318 68 H${E.x}`, 's') + ringFront() + hookH() + c.front + ln('M154 74 L168 94', 't') + cut(168, 106) + t(190, 40, 'yan halka → ıslat → sık')); })()],
    ],
  },
  {
    id: 'snell', group: 'İğne / fırdöndü bağlama', name: 'Kürek iğne bağlama (Snell)', tag: 'Kürek başlı iğne, hair rig',
    use: 'Gözsüz kürek (yassı) başlı iğneler ve sazan "hair rig" iğneleri. Misina iğnenin sapına sarılır, iğneyle düz bir çizgide çeker; tutma oranı yüksektir.',
    video: 'kürek iğne bağlama',
    steps: [
      ['Misinayı iğnenin sapının üstüne yatırın. Ucunu bende doğru uzatıp geri kıvırın; sapın altında bir halka oluşsun.',
        fig(hookSpade + ln('M318 64 H90', 's') + ln('M90 64 C66 64 66 92 92 92 H220', 't') + t(120, 50, 'misina sapın üstünde') + t(140, 140, 'halka (sapın altında)'))],
      ['Halkanın alttaki kolunu tutun; sapı ve iki teli birlikte, KÜREKTEN BENDE DOĞRU 7–10 tur sarın.',
        (() => { const c = coil(130, 8, 12, 72, 22); return fig(hookSpade + c.back + ln('M318 64 H90', 's') + ln('M90 64 C66 64 66 92 92 92 H130', 't') + c.front + arrow('M226 128 H134') + t(120, 148, '7–10 tur, bende doğru')); })()],
      ['Sarımları parmağınızla tutup ana misinayı (sağ taraf) yavaşça çekin; halka sarımların altına girip kapanır.',
        (() => { const c = coil(130, 8, 12, 72, 22); return fig(hookSpade + c.back + ln('M318 64 H130', 's') + c.front + arrow('M260 40 H316') + t(200, 30, 'ana misinayı çek') + t(110, 140, 'halka kapanır')); })()],
      ['Sıkıca çekip fazlalığı kesin. Misina, iğnenin İÇ tarafından (ucun olduğu taraftan) çıkmalı.',
        (() => { const c = coil(150, 8, 9, 70, 10); return fig(hookSpade + c.back + ln('M318 64 H150', 's') + c.front + cut(130, 100) + t(180, 120, 'iğneyle düz çeker')); })()],
    ],
  },
  // ——— Halka düğümleri ———
  {
    id: 'rapala', group: 'Halka düğümleri', name: 'Rapala halkası (kaymaz halka)', tag: 'Maket daha canlı oynar',
    use: 'Maket balık ve kaşığa serbest bir halka ile bağlanır; maket misinaya sıkışmadığı için daha doğal oynar. Levrek ve lüfer spininde idealdir.',
    video: 'rapala knot non slip loop',
    steps: [
      ['Ucundan 15 cm geride gevşek, basit bir düğüm atın. Ucu maketin halkasından geçirin.',
        fig(lureRing + ln('M318 64 H236 C206 64 198 38 214 34 C232 30 238 60 212 72 C190 82 120 64 64 64', 's') + ln('M64 64 C48 64 46 46 62 46 H130', 't') + t(190, 22, 'gevşek basit düğüm') + t(70, 30, 'maket halkası'))],
      ['Ucu basit düğümün içinden, ÇIKTIĞI TARAFTAN geri geçirin.',
        fig(lureRing + ln('M318 64 H236 C206 64 198 38 214 34 C232 30 238 60 212 72 C190 82 120 64 64 64', 's') + ln('M64 64 C48 64 46 46 62 46 H170 C200 46 214 50 218 56 H250', 't') + arrow('M150 30 C180 30 200 38 212 48') + t(110, 112, 'düğümün içinden geri'))],
      ['Ucu ana misinanın etrafına 4–5 tur sarın (ince misinada 6–7).',
        (() => { const c = coil(250, 4, 14, 64, 16); return fig(lureRing + c.back + ln('M318 64 H236 C206 64 198 38 214 34 C232 30 238 60 212 72 C190 82 120 64 64 64', 's') + ln('M64 64 C48 64 46 46 62 46 H170 C200 46 214 50 218 56 L250 80', 't') + c.front + t(250, 112, '4–5 tur')); })()],
      ['Ucu tekrar basit düğümün içinden, GİRDİĞİ TARAFTAN geçirin. Islatıp sıkın: makette serbest bir halka kalır.',
        fig(lureRing + ln('M318 64 H150', 's') + blob(150, 64, 28) + ln('M64 64 C80 42 136 46 140 60', 's') + ln('M64 64 C80 86 136 82 140 68', 's') + ln('M162 70 L178 88', 't') + cut(178, 100) + t(70, 120, 'serbest halka'))],
    ],
  },
  {
    id: 'surgeon', group: 'Halka düğümleri', name: 'Cerrah halkası (Surgeon’s loop)', tag: 'Hızlı halka',
    use: 'Köstek ucuna halka yapmak (halkadan halkaya bağlantı), şamandıra ve kurşun takmak için. Saniyeler içinde atılır.',
    video: 'surgeons loop knot',
    steps: [
      ['Misinanın ucunu 15 cm ikiye katlayın.',
        fig(dbl('M318 64 H120') + t(150, 44, 'ikiye katlanmış uç'))],
      ['Katlı misinayla basit bir düğüm atın (sıkmayın).',
        fig(dbl('M318 64 H236 C206 64 196 30 218 26 C242 22 244 68 206 80 H110') + t(170, 18, 'basit düğüm'))],
      ['Halkayı düğümün içinden BİR KEZ DAHA geçirin (çift düğüm).',
        fig(dbl('M318 64 H236 C206 64 196 30 218 26 C242 22 244 68 214 78 C190 86 186 44 206 40 C228 36 228 86 190 92 H110') + arrow('M140 120 C170 120 196 104 200 90') + t(120, 140, 'bir tur daha'))],
      ['Halkayı ve iki ucu birlikte çekip sıkın. Ucu kesin.',
        fig(ln('M318 64 H214', 's') + blob(210, 64, 26) + ln('M198 60 C150 26 92 34 92 64 C92 94 150 102 198 68', 's') + ln('M222 70 L238 90', 't') + cut(238, 102) + t(96, 120, 'sağlam halka'))],
    ],
  },
  {
    id: 'dropper', group: 'Halka düğümleri', name: 'Kol düğümü (Dropper loop)', tag: 'Çapari, kollu dip takımı',
    use: 'Ana misinanın ortasında, misinaya dik duran bir halka (kol) yapar. Buraya köstek ve iğne bağlanır; çapari ve kollu dip takımı bununla yapılır.',
    video: 'dropper loop düğümü kol düğümü',
    steps: [
      ['Misinanın ortasında 10–15 cm uzunluğunda bir halka yapın.',
        fig(ln('M8 100 H120 C120 30 200 30 200 100 H318', 's') + t(132, 140, 'halka (10–15 cm)'))],
      ['Halkanın iki yanını birbirinin etrafında 5–7 kez döndürün (ortada çift yönlü bükülme oluşur).',
        (() => {
          let s2 = '';
          const xs = [96, 116, 136, 156, 176, 196];
          xs.forEach((x, i) => { s2 += ln(`M${x} ${i % 2 ? 108 : 92} C${x + 10} ${i % 2 ? 108 : 92} ${x + 10} ${i % 2 ? 92 : 108} ${x + 20} ${i % 2 ? 92 : 108}`, 's'); s2 += ln(`M${x} ${i % 2 ? 92 : 108} C${x + 10} ${i % 2 ? 92 : 108} ${x + 10} ${i % 2 ? 108 : 92} ${x + 20} ${i % 2 ? 108 : 92}`, 's'); });
          return fig(ln('M8 100 H96', 's') + ln('M216 100 H318', 's') + s2 + ln('M150 92 C140 30 180 30 166 92', 't') + t(120, 140, '5–7 dönme'));
        })()],
      ['Halkanın tepesini, bükülmelerin TAM ORTASINDAKİ aralıktan aşağı doğru geçirin.',
        (() => {
          let s2 = '';
          [96, 116, 136, 176, 196].forEach((x, i) => { s2 += ln(`M${x} 92 C${x + 10} 92 ${x + 10} 108 ${x + 20} 108`, 's'); s2 += ln(`M${x} 108 C${x + 10} 108 ${x + 10} 92 ${x + 20} 92`, 's'); });
          return fig(ln('M8 100 H96', 's') + ln('M216 100 H318', 's') + s2 + ln('M156 96 C150 40 176 40 170 96 C168 120 160 130 158 140', 't') + arrow('M210 40 C190 60 176 80 168 100') + t(220, 36, 'ortadaki aralıktan'));
        })()],
      ['Halkayı tutup (dişle de olur) iki ucu yavaşça çekin; ortadan dik çıkan bir kol oluşur.',
        fig(ln('M8 100 H318', 's') + blob(160, 100, 30) + ln('M152 94 C130 20 190 20 168 94', 't') + t(190, 36, 'kol (köstek buraya)'))],
    ],
  },
  // ——— Misina birleştirme ———
  {
    id: 'dbluni', group: 'Misina birleştirme', name: 'Çift Uni', tag: 'Ana ip + lider',
    use: 'İki misinayı ya da örgü (PE) ana ipe florokarbon lideri birleştirmek için. Kolay ve güvenilir; makara kılavuzlarından rahat geçer.',
    video: 'double uni knot çift uni',
    steps: [
      ['İki misinanın uçlarını 15–20 cm üst üste getirin.',
        fig(ln('M8 58 H230', 's') + ln('M318 74 H90', 't') + t(10, 40, 'ana ip (PE)') + t(240, 100, 'lider'))],
      ['Ana ipin ucuyla, lider ve kendi teli etrafına Uni yapın: halka + 4–6 tur (PE ise 8–10).',
        (() => { const c = coil(170, 5, 12, 66, 22, 's'); return fig(c.back + ln('M8 58 H170', 's') + ln('M318 74 H90', 't') + c.front + t(170, 120, 'uni (4–6 tur)')); })()],
      ['Liderin ucuyla aynısını ters yönde yapın.',
        (() => { const a = coil(170, 5, 12, 66, 22, 's'); const b = coil(84, 5, 12, 66, 22, 't'); return fig(a.back + b.back + ln('M8 58 H170', 's') + ln('M318 74 H144', 't') + a.front + b.front + t(84, 120, 'uni 2') + t(176, 120, 'uni 1')); })()],
      ['Islatın, iki ANA teli zıt yönlere çekin; iki düğüm birbirine kavuşur. Uçları kesin.',
        (() => { const a = coil(162, 4, 7, 66, 10, 's'); const b = coil(132, 4, 7, 66, 10, 't'); return fig(a.back + b.back + ln('M8 66 H160', 's') + ln('M318 66 H160', 't') + a.front + b.front + arrow('M110 110 H30') + arrow('M210 110 H290') + cut(150, 40)); })()],
    ],
  },
  {
    id: 'albright', group: 'Misina birleştirme', name: 'Albright düğümü', tag: 'İnce + kalın',
    use: 'Kalınlıkları çok farklı iki ipi birleştirmek için: örgü (PE) ile kalın florokarbon/monofilament lider, ya da misina ile çelik tel.',
    video: 'albright knot',
    steps: [
      ['Kalın lideri (turuncu) ucundan 10 cm geri kıvırıp bir halka yapın.',
        fig(ln('M8 72 H220 C250 72 250 46 220 46 H120', 't') + t(140, 104, 'kalın lider, kıvrılmış') + t(252, 40, 'halka'))],
      ['İnce ipi (mavi) halkanın içinden 10–15 cm geçirin.',
        fig(ln('M8 72 H220 C250 72 250 46 220 46 H120', 't') + ln('M318 59 H120', 's') + t(250, 92, 'ince ip (PE)'))],
      ['İnce ipi geri dönerek halkanın İKİ KOLUNU birlikte, halkanın ucuna doğru 10–12 tur sarın.',
        (() => { const c = coil(128, 7, 13, 59, 20, 's'); return fig(c.back + ln('M8 72 H220 C250 72 250 46 220 46 H120', 't') + ln('M318 59 H128', 's') + c.front + t(130, 112, '10–12 tur, halkanın ucuna doğru')); })()],
      ['Ucu, halkadan GİRDİĞİ TARAFTAN çıkarın. Islatıp önce ince ipi, sonra iki ana teli çekerek sıkın; uçları kesin.',
        (() => { const c = coil(150, 7, 8, 59, 11, 's'); return fig(c.back + ln('M8 66 H230 C246 66 246 52 230 52 H200', 't') + ln('M318 59 H150', 's') + c.front + ln('M206 52 L190 30', 's') + cut(184, 30) + t(40, 110, 'ıslat → sık → kes')); })()],
    ],
  },
  {
    id: 'fg', group: 'Misina birleştirme', name: 'FG düğümü', tag: 'En ince ve en sağlam PE–lider',
    use: 'Örgü (PE) ana ipe florokarbon lider bağlamanın en sağlam ve en ince yolu; kılavuzlardan takılmadan geçer. Biraz pratik ister.',
    video: 'fg knot nasıl bağlanır',
    steps: [
      ['PE ipi (mavi) gergin tutun (makineden kamış ucuna, ucu dişte ya da parmakta). Lideri (turuncu) PE\'nin altına çapraz yerleştirin.',
        fig(ln('M8 60 H318', 's') + ln('M60 110 L230 54 L260 44', 't') + t(10, 40, 'PE gergin') + t(60, 140, 'lider'))],
      ['PE\'yi liderin etrafına bir ÜSTTEN bir ALTTAN dönüşümlü sarın (15–20 kez). Sarımlar sıkı ve sık dursun.',
        (() => { let s2 = ''; for (let i = 0; i < 9; i++) { const x = 80 + i * 18; s2 += i % 2 ? `<path d="M${x} 52 Q${x + 9} 80 ${x + 18} 52" class="g-back bs"/>` : ln(`M${x} 52 Q${x + 9} 80 ${x + 18} 52`, 's'); } return fig(ln('M8 66 H318', 't') + s2 + ln('M8 52 H80', 's') + t(90, 110, 'bir üstten, bir alttan (örgü gibi)')); })()],
      ['Örgüyü kilitlemek için PE ucuyla lider + ana ipin etrafına 6–8 yarım düğüm atın.',
        (() => { let s2 = ''; for (let i = 0; i < 9; i++) { const x = 60 + i * 12; s2 += ln(`M${x} 56 Q${x + 6} 74 ${x + 12} 56`, 's'); } return fig(ln('M8 66 H318', 't') + s2 + ln('M8 56 H60', 's') + blob(196, 66, 20) + blob(220, 66, 20) + blob(244, 66, 20) + t(190, 40, 'yarım düğümler')); })()],
      ['Liderin fazlasını kesin; PE ucuyla yalnız PE etrafına birkaç yarım düğüm daha atıp bitirin.',
        (() => { let s2 = ''; for (let i = 0; i < 9; i++) { const x = 60 + i * 12; s2 += ln(`M${x} 56 Q${x + 6} 74 ${x + 12} 56`, 's'); } return fig(ln('M8 66 H170', 't') + s2 + ln('M168 60 H318', 's') + blob(184, 60, 18) + blob(204, 60, 18) + cut(160, 100) + t(220, 40, 'ince ve pürüzsüz')); })()],
    ],
  },
];
