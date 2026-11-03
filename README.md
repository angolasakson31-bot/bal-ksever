# 🎣 Rastgele

Kıyıdan balık tutan arkadaşlar için av günlüğü. Telefonda uygulama gibi çalışan bir web sitesi (PWA); iPhone ve Android'de çalışır.

## v1 özellikleri
- **Av günlüğü:** fotoğraf, tür, boy, ağırlık, adet, yem, takım, mera, konum, not. Asgari boy uyarısı.
- **Mera haritası:** meraları haritada işaretleme, avları haritada görme, Google/Apple yol tarifi.
- **Harita & Meralarım (tek ekran):** tam ekran harita; arama kutusu ve 📍/🔍 düğmeleri (📍: konumunu bulur ve bulunduğun yerin kartını açar/kapatır, karta dokun: detay) haritanın üstünde. Meralarım en altta yana kayan kompakt kartlarda (24 saatlik hava şeridi kartın içinde ayrıca kayar; kaydırınca harita o meraya gider; karta dokun: detay). Saat ve puan türü üstteki tek 🕐 “Hangi saate göre? · Değiştir” düğmesinden seçilir (mera eklemek için haritaya basılı tutun). Haritada yuvarlağa dokun: kartı gelir, tekrar dokun: detay. Haritadaki işaretlerde sıra numarası ve skor rengi görünür.
  Zaman seçenekleri tam o andan itibaren hesaplanır (15 dk hassasiyet): şimdi, +½/+1/+2/+3/+5/+6/+12 saat, bu akşam, yarın sabah, yarın akşam, 24 saatin en iyisi, 7 gün içinde istenen gün/saat.
  **🚗 Gidip geleceğim:** “kaç saat sonra çıkacaksınız / kaç saat kalacaksınız” seçilir; meralar o aralığın ortalama skoruna göre sıralanır, her merada aralık boyunca skor şeridi ve en iyi an görünür.
- **Meraya dokun → ayrıntılı tahmin (sekmeli):** üstte puan ve öneri; altında ⏱️ Saatlik · 🐟 Türler · 📈 Grafikler · 🌤️ Ayrıntı sekmeleri.
- Ayrıntılı tahmin içeriği: öneri metni (ne zaman, hangi tür, hangi yem/takım, rüzgara göre nereye atılır), türlere göre tahmin,
  grafikler (skor, rüzgar/hamle, dalga/soluğan veya yağış, hava/su sıcaklığı, basınç), ayrıntılı hava (hissedilen, nem, görüş, UV,
  dalga periyodu, akıntı, güneş ve ay doğuş/batış, solunar).
- **Harita görünümleri (sağ üst düğme):** 🧭 Standart (OpenStreetMap, en güncel, varsayılan) · 🛰️ Uydu + isimler (Esri) · ⛰️ Topoğrafik (OpenTopoMap) · ⚓ Deniz işaretleri katmanı (OpenSeaMap). Hepsi ücretsiz, anahtarsız; seçim hatırlanır.
- **Dokunulan yerin adı:** haritada bir noktaya dokununca o yerin adı (göl, köy, iskele…) gösterilir ve mera kaydında otomatik dolar.
- **Haritada yer arama:** yazarken öneri (Photon) ve “Ara” ile ayrıntılı arama (Nominatim), iki ücretsiz OpenStreetMap servisi birlikte; Türkiye öncelikli, haritada bakılan bölgeye yakın sonuçlar önce, her sonuçta tür (köy, mahalle, dere, göl, iskele…) ve il/ilçe. Sonuca dokununca harita oraya gider (iğne konmaz); tam yeri kullanıcı seçer. Son 5 arama hatırlanır.
- **Meraya basılı tut:** adını değiştir, sil, düzenle, av ekle, yol tarifi.
- **Şu andan itibaren 6 saat (30 dk veya 15 dk adım):** her an için hava simgesi, sıcaklık, yağmur, rüzgar/hamle, dalga ve balık skoru. Open-Meteo'nun 15 dakikalık verisi kullanılır; olmayan yerlerde saatlik verinin arası hesaplanır.
- **Saat saat görsel hava:** her saat için hava simgesi (güneş, bulut, yağmur, gece), sıcaklık, yağmur ihtimali sütunu, rüzgar ok + hız + hamle; 7 günlük gün kartları (simge, en yüksek/en düşük, yağış, rüzgar).
- **Haritada boş bir noktaya dokun:** o noktanın skoru ve özeti; tek dokunuşla ayrıntılı tahmin veya mera kaydı.
- **Deniz ve tatlı su:** su tipi otomatik algılanır (deniz verisi varsa deniz, yoksa göl). Elle göl/baraj veya nehir/dere seçilebilir. Her su tipi için ayrı puanlama yapılır.
- **İstatistik:** tür, saat, ay, yem ve meraya göre dağılım; rekorlar.
- **Rehber (alt bölümler):** 🐟 Marmara balıkları · 🪢 12 düğüm (iğne: Palomar, Geliştirilmiş kilit, Trilene, Uni, San Diego Jam, Kürek iğne/Snell · halka: Rapala, Cerrah, Kol düğümü · birleştirme: Çift Uni, Albright, FG), her biri 4–5 çizimli adım + video bağlantısı · 🎣 takımlar: deniz 7 (çapari, LRF, spin, kollu dip, şamandıralı, surf, kalamar), göl/dere 6 (sazan method feeder, hafif şamandıra, turna, sudak jig, yayın, alabalık) şema + ölçüler + kullanım · 🎒 kontrol listesi · ⚙️ ayarlar.
- **📲 Ana ekrana ekle:** üst çubukta ve Ayarlar'da; tarayıcı destekliyorsa tek dokunuş, değilse platforma göre adım adım anlatım.
- **Yedekleme:** tüm verileri tek dosyaya indirip geri yükleme.
- Çevrimdışı çalışır. Veriler sadece telefonda saklanır.

## Balık skoru nasıl hesaplanıyor? (`js/fishscore.js`)
Puan 0–10 arasıdır. Ağırlıklar kanıtın gücüne göre verildi:
1. **Su sıcaklığı** (en güçlü etken). Denizde Open-Meteo'nun ölçtüğü deniz suyu sıcaklığı kullanılır. Tatlı suda son 5 günün hava sıcaklığından tahmin edilir. Ani soğuma puanı düşürür.
2. **Işık:** alacakaranlık ±1,5 saat en iyi zaman, gece iyi, güneşli öğle saatleri kötü.
3. **Dalga ve rüzgar:** hafif dalga ve kırışık su iyi; yüksek dalga ve sert rüzgar kötü (ayrıca ⚠️ güvenlik uyarısı). Fırtına sonrası bulanık su levrek için artı puan.
4. **Yağış:** şimşek ve kuvvetli yağış kötü. Derede son 24 saatte çok yağış varsa su kabarık ve bulanık olur.
5. **Basınç ve ay (solunar):** bilimsel kanıtı zayıf olduğu için düşük ağırlıkla eklendi.

**İki sıralama seçeneği:** 🎣 *Balık puanı* (ilk puanlama, aynen) veya 🎣💨 *Balık + rüzgar* (balık puanı + yalnızca rüzgar yönü/bölge etkisi; rüzgar hızı iki kez sayılmaz). Köşedeki 💨 rozet ayrıca rüzgar puanıdır. Her merada dokunmadan görülebilen 6 saatlik mini hava şeridi var.

**Solunar:** bilimsel çalışmalar solunar tablolarla av oranı arasında ilişki bulamadığı için ağırlığı +0,2 / +0,1'e düşürüldü.

**🧭 Kıyı yönü:** her meranın suya bakış yönü Open-Meteo yükselti verisinden (150/300/600 m, 16 yön) otomatik bulunur ve kaydedilir; mera düzenleme ekranından elle değiştirilebilir. Rüzgar sudan kıyıya esiyorsa +0,6, kıyıya çok sert vuruyorsa −0,5, karadan (arkadan) esiyorsa −0,4 (Balık + rüzgar puanı ve rüzgar puanında).

**💨 Rüzgar puanı:** rüzgar hızı, hamle, denizde dalga; Boğaz/Marmara'da sert lodos ve uzun lodosta akıntı uyarısı; göl/derede soğuk mevsimde soğuk kuzey rüzgarı (−) ve ılık güney rüzgarı (+); 24 saat aynı yönden esen rüzgar (yem rüzgarın vurduğu kıyıda birikir).

Veriler Open-Meteo'dan `best_match` ile çekilir: konuma göre en iyi hava modelleri (ECMWF, DWD ICON, Météo-France vb.) otomatik birleştirilir. Uygulama açıldığında, uygulamaya geri dönüldüğünde ve 10 dakikada bir yenilenir; ayrıntı ekranında elle yenileme düğmesi vardır.

## Telefona kurulum
- **iPhone (Safari):** siteyi açın → Paylaş ⬆️ → *Ana Ekrana Ekle*
- **Android (Chrome):** siteyi açın → ⋮ menü → *Uygulamayı yükle*

## Yayınlama (GitHub Pages)
1. GitHub'da repo → **Settings → Pages → Source: GitHub Actions** seçin.
2. Kod `main` dalına geldiğinde site otomatik yayınlanır:
   `https://angolasakson31-bot.github.io/bal-ksever/`

## Bilgisayarda deneme
```bash
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```

## Yol haritası
- [x] v1: kişisel av günlüğü, harita, hava, istatistik, rehber
- [x] Mera sıralama, nokta tahmini, tatlı su desteği
- [x] Harita + sıralama tek ekran, tür tahmini, grafikler, öneri metni
- [ ] v2: arkadaş grubu (giriş, ortak akış, ortak meralar)
- [ ] v2: sıralama tablosu, rozetler, aylık yarışma
- [ ] Plan/buluşma, bildirimler
- [ ] Fotoğraftan tür tanıma
