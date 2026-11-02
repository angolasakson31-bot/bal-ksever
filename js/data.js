// Marmara / İstanbul kıyı balıkçılığı için tür rehberi.
// minSize: amatör avcılıkta asgari boy (cm). Mevzuat değişebilir; resmi tebliği kontrol edin.
export const SPECIES = [
  { name: 'İstavrit', emoji: '🐟', minSize: 13, season: 'Tüm yıl, en iyisi sonbahar–kış',
    where: 'İskele, mendirek, Boğaz kıyıları', bait: 'Çapari, karides, tavuk göğsü',
    method: 'Çapari, LRF, ışıklı gece avı', tip: 'Akşamüstü ve ilk saatlerde iskele ışıklarının altında sürü halinde gelir.' },
  { name: 'Lüfer', emoji: '🐟', minSize: 20, season: 'Eylül – Aralık (Boğaz göçü)',
    where: 'Boğaz, akıntılı burunlar', bait: 'Canlı istavrit, yaprak zoka, rapala, kaşık',
    method: 'Spin, sırtı, yemli dip', tip: 'Çinekop (20 cm altı lüfer) tutulması yasaktır, geri salın.' },
  { name: 'Palamut', emoji: '🐟', minSize: 25, season: 'Eylül – Kasım',
    where: 'Boğaz girişleri, açığa uzanan mendirekler', bait: 'Kaşık, rapala, zoka',
    method: 'Spin, uzak atış', tip: 'Sürü geçtiğinde kısa süre çok yoğun olur; sabah erken gidin.' },
  { name: 'Levrek', emoji: '🐟', minSize: 25, season: 'Ekim – Mart en verimli',
    where: 'Kayalık, mendirek dibi, dere ağızları', bait: 'Karides, silikon, rapala, kaşık',
    method: 'Spin, LRF, yemli şamandıra', tip: 'Hafif dalgalı, suyun biraz bulanık olduğu gece ve alacakaranlıkta aktif.' },
  { name: 'Çipura', emoji: '🐟', minSize: 20, season: 'Yaz – sonbahar',
    where: 'Midyeli kayalık, iskele ayakları', bait: 'Midye, karides, yengeç',
    method: 'Dip takımı, şamandıra', tip: 'Yemi ezip bırakır, vuruşu bekleyip öyle tasmalayın.' },
  { name: 'Karagöz', emoji: '🐟', minSize: 18, season: 'Tüm yıl, özellikle kış geceleri',
    where: 'Kayalık, mendirek taşları arası', bait: 'Karides, midye, boru kurdu',
    method: 'Dip takımı, şamandıra', tip: 'Gece taş diplerinde dolaşır; ince misina işe yarar.' },
  { name: 'Sargoz', emoji: '🐟', minSize: 18, season: 'Tüm yıl',
    where: 'Dalgalı kayalık', bait: 'Karides, yengeç, midye', method: 'Dip takımı',
    tip: 'Hafif dalgalı köpüklü suları sever.' },
  { name: 'Mırmır', emoji: '🐟', minSize: 20, season: 'Yaz',
    where: 'Kumluk, sığ sahil', bait: 'Kum kurdu, karides', method: 'Surf / dip takımı',
    tip: 'Gece kıyıya çok yaklaşır, uzak atış gerekmez.' },
  { name: 'Kefal', emoji: '🐟', minSize: 20, season: 'Tüm yıl',
    where: 'Liman, dere ağzı, iskele', bait: 'Ekmek içi, hamur, peynirli hamur',
    method: 'Şamandıra', tip: 'Yemleme (ekmek atma) yaparak sürüyü toplayın.' },
  { name: 'Uskumru', emoji: '🐟', minSize: 20, season: 'İlkbahar ve sonbahar',
    where: 'Boğaz, açık iskeleler', bait: 'Çapari', method: 'Çapari', tip: 'İstavrit sürüleriyle karışık gelebilir.' },
  { name: 'Kolyoz', emoji: '🐟', minSize: 18, season: 'Yaz – sonbahar',
    where: 'İskele, mendirek', bait: 'Çapari, küçük kaşık', method: 'Çapari, spin', tip: 'Uskumruya benzer, gözü daha iri, sırt çizgileri farklıdır.' },
  { name: 'Mezgit', emoji: '🐟', minSize: 13, season: 'Kış',
    where: 'Derin suya bakan mendirek ve iskeleler', bait: 'Karides, kurt', method: 'Dip takımı', tip: 'Soğuk sularda kıyıya yaklaşır.' },
  { name: 'Barbunya', emoji: '🐟', minSize: 13, season: 'Yaz – sonbahar',
    where: 'Kumlu-çamurlu dip', bait: 'Kum kurdu, karides', method: 'Dip takımı', tip: '' },
  { name: 'İskorpit', emoji: '🐟', minSize: null, season: 'Tüm yıl',
    where: 'Kayalık, taş dipleri', bait: 'Karides, balık parçası', method: 'LRF, dip takımı',
    tip: 'Dikenleri zehirlidir! Eldivenle tutun, dikene dikkat edin.' },
  { name: 'İzmarit', emoji: '🐟', minSize: null, season: 'Tüm yıl',
    where: 'İskele, kayalık', bait: 'Karides, hamur', method: 'Şamandıra, LRF', tip: 'Yem hırsızıdır; küçük iğne kullanın.' },
  { name: 'Zargana', emoji: '🐟', minSize: null, season: 'İlkbahar, sonbahar',
    where: 'Yüzey, iskele çevresi', bait: 'Balık şeridi, küçük kaşık', method: 'Şamandıra, spin', tip: 'Gagası serttir, iğne tutunmakta zorlanır.' },
  { name: 'Kalamar', emoji: '🦑', minSize: null, season: 'Ekim – Şubat',
    where: 'Işıklı iskeleler', bait: 'Kalamar zokası (egi)', method: 'Egi / zokalama', tip: 'Gece iskele ışıklarının sınırında avlanır.' },
  { name: 'Diğer', emoji: '🐠', minSize: null, season: '', where: '', bait: '', method: '', tip: '' },
];

export const BAITS = ['Karides', 'Midye', 'Kum kurdu', 'Boru kurdu', 'Hamur', 'Ekmek', 'Tavuk', 'Sardalya parçası',
  'Canlı yem', 'Çapari', 'Silikon', 'Rapala', 'Kaşık', 'Yaprak zoka', 'Egi (kalamar zokası)'];

export const METHODS = ['Çapari', 'LRF', 'Spin', 'Dip takımı', 'Şamandıra', 'Surf', 'Sırtı', 'Zokalama'];

export const CHECKLIST = ['Kamış ve makine', 'Yedek misina / lider', 'İğne, kurşun, fırdöndü', 'Çapari', 'Yem',
  'Kafa lambası + yedek pil', 'Kepçe', 'Kova / soğutucu', 'Pense ve makas', 'Bez / havlu',
  'Mont / yağmurluk', 'Su ve yiyecek', 'Telefon şarj (powerbank)', 'Ölçü metresi', 'Çöp poşeti'];

export function findSpecies(name) {
  if (!name) return null;
  const n = name.trim().toLocaleLowerCase('tr');
  return SPECIES.find(s => s.name.toLocaleLowerCase('tr') === n) || null;
}
